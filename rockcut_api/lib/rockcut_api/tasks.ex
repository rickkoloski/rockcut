defmodule RockcutApi.Tasks do
  @moduledoc """
  The task boards (D38; one per department since D41): tasks planned on days
  or on the Future list, the Daily card, and the change log (`task_events`).
  Which cards show on a day is decided only by `Placement`.

  **The board.** Every function that reads or writes a board takes its
  `%Department{}` first. Lookups by id match the department too
  (`get_task/2`, `get_item/2`), so an id from another board is not found;
  a function given a task or item from another board answers
  `{:error, :not_found}` and changes nothing.

  "Today" is the Colorado date, never the server's (Fly runs in UTC). Every
  function that needs it takes it as an optional last argument so tests can
  pin it.

  Callers authorize first (`Authz.can?(person, :write, {:tasks, dept})` and
  friends) and pass the acting person. The context validates data only. Every
  write runs in one transaction with its event row(s).

  **Lists.** A day's list is every task with that `due_on`, done or not (a
  task done "in place" keeps its spot). The Future list is the open tasks
  with no `due_on`; a task finished from it leaves the list. `position` is
  dense (1, 2, 3, …) within each list after every write.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Authz, Repo}
  alias RockcutApi.Accounts.{Department, User}

  alias RockcutApi.Tasks.{
    DailyCheck,
    DailyItem,
    Event,
    Placement,
    Series,
    Task,
    TaskSeries
  }

  alias RockcutApi.Scheduling.{Recurrence, ScheduleEvent, Shift}

  @history_page_size 50
  @max_items 12

  @doc "Today's date in Colorado."
  def today, do: today_at(DateTime.utc_now())

  @doc "The Colorado date at the instant `now` (any time zone)."
  def today_at(%DateTime{} = now) do
    now |> DateTime.shift_zone!(Recurrence.zone()) |> DateTime.to_date()
  end

  @doc """
  The boards `user` can open (D41), in department order (by id, the seed
  order: Brewery, Taproom, Office, Sales), each `%{department, manage}`:
  `manage` is History and Edit Daily items. Every assignable department has a
  board; owners get all of them, a shared tablet its home board (D40).
  """
  def boards_for(%User{} = user) do
    for dept <- board_departments(),
        Authz.can?(user, :read, {:tasks, dept}),
        do: %{department: dept, manage: Authz.can?(user, :history, {:tasks, dept})}
  end

  # Every department with a board (the assignable ones), in department order.
  defp board_departments do
    Accounts.list_departments() |> Enum.filter(& &1.assignable) |> Enum.sort_by(& &1.id)
  end

  ## The board

  @max_range_days 31

  @doc """
  The board's read model for `from..to` (at most #{@max_range_days} days,
  `from` ≤ `to`, else `{:error, :range_too_long}`):

    * `days`: each day in the range with its `cards` (through `Placement`),
      its `header` (the department's published shifts and events) and its `daily`
      card;
    * `unfinished`: every open task planned before `today`, whatever the
      range, oldest day first;
    * `future`: the Future list.

  Names are preloaded once. One query per kind for the whole range.

  D49: `linked: true` keeps only the tasks made from production steps (the
  Gantt's Task list panel); the header and Daily cards are as usual.
  """
  def board(%Department{} = dept, %Date{} = from, %Date{} = to, today \\ today(), opts \\ []) do
    with {:ok, days} <- range_days(from, to) do
      %{cards: cards, daily: daily, unfinished: unfinished} =
        board_parts(dept, days, today, opts[:linked] == true)

      headers = headers(dept, days)

      {:ok,
       %{
         from: from,
         to: to,
         today: today,
         days:
           Enum.map(days, fn day ->
             %{date: day, cards: cards[day], header: headers[day], daily: daily[day]}
           end),
         unfinished: unfinished,
         future: cards[:future]
       }}
    end
  end

  @doc """
  The All departments view (D41 §3.6, owners only; callers authorize): every
  board's read model for `from..to` together, read-only. Built from each
  board's own parts (`board/4`'s, without the header), in department order:

    * `days`: each day's `cards` from every board, by department, then in
      each board's order, each card with its `department` key, and
      `daily_counts`: `%{department, done, total}` for each board whose
      Daily card has items that day;
    * `unfinished` and `future`: every board's, merged the same way.

  No schedule header. Same range limit as `board/4`.
  """
  def all_boards(%Date{} = from, %Date{} = to, today \\ today()) do
    with {:ok, days} <- range_days(from, to) do
      parts = for dept <- board_departments(), do: {dept.key, board_parts(dept, days, today)}

      tagged = fn pick ->
        Enum.flat_map(parts, fn {key, part} ->
          part |> pick.() |> Enum.map(&Map.put(&1, :department, key))
        end)
      end

      {:ok,
       %{
         from: from,
         to: to,
         today: today,
         days:
           Enum.map(days, fn day ->
             %{
               date: day,
               cards: tagged.(& &1.cards[day]),
               daily_counts:
                 for {key, %{daily: daily}} <- parts, daily[day].total > 0 do
                   %{department: key, done: daily[day].done, total: daily[day].total}
                 end
             }
           end),
         unfinished: tagged.(& &1.unfinished),
         future: tagged.(& &1.cards[:future])
       }}
    end
  end

  def max_range_days, do: @max_range_days

  defp range_days(from, to) do
    if Date.compare(from, to) == :gt or Date.diff(to, from) >= @max_range_days,
      do: {:error, :range_too_long},
      else: {:ok, Date.range(from, to) |> Enum.to_list()}
  end

  # A board's cards (each day's and `:future`, through `Placement`), its Daily
  # cards and its Unfinished list: everything but the header.
  defp board_parts(%Department{} = dept, days, today, linked? \\ false) do
    tasks =
      dept.id
      |> board_tasks(List.first(days), List.last(days), today)
      |> Enum.filter(&(not linked? or Task.linked?(&1)))
      |> RockcutApi.Production.TaskLink.describe()
      |> Series.mark_last()

    %{
      cards: Placement.cards(tasks, days, today),
      daily: daily_cards(dept, days, today),
      unfinished: tasks |> Placement.unfinished(today) |> Enum.map(&unfinished_card/1)
    }
  end

  # Everything any card in the range can come from: tasks planned or finished
  # in it, the Future list, and the open tasks planned before today.
  defp board_tasks(dept_id, from, to, today) do
    Repo.all(
      from t in Task,
        where:
          t.department_id == ^dept_id and
            ((t.due_on >= ^from and t.due_on <= ^to) or
               (t.completed_on >= ^from and t.completed_on <= ^to) or
               (is_nil(t.completed_at) and (is_nil(t.due_on) or t.due_on < ^today))),
        preload: [:assignee, :completed_by, :created_by, production_step: :batch]
    )
  end

  # The Unfinished card lists tasks, not day cards: key `{id, :unfinished}`.
  defp unfinished_card(%Task{} = t) do
    %{
      key: {t.id, :unfinished},
      day: :unfinished,
      task: t,
      planned_on: t.due_on,
      done_on: nil,
      from_future: false,
      locked: false,
      overdue: true
    }
  end

  @doc """
  The day header for each of `days` (Colorado dates), as `%{date => header}`:

    * `people`: one entry per person with the department's published shifts
      starting that day, their shifts in time order and total `hours`, in
      roster order (`schedule_order`, then name);
    * `open_shifts`: its published, unassigned shifts that day;
    * `events`: its published schedule events overlapping that day.

  Drafts, shift notes and time off are never shown. One query each for shifts
  and events across the whole range.
  """
  def headers(%Department{id: dept_id}, days) do
    case Enum.to_list(days) do
      [] ->
        %{}

      days ->
        {first, last} = Enum.min_max_by(days, &Date.to_gregorian_days/1)
        lo = Recurrence.local_midnight(first)
        hi = Recurrence.local_midnight(Date.add(last, 1))

        shifts =
          Repo.all(
            from s in Shift,
              where:
                s.department_id == ^dept_id and s.status == "published" and
                  s.starts_at >= ^lo and s.starts_at < ^hi,
              order_by: [asc: s.starts_at, asc: s.id],
              preload: [:position, :assignee]
          )
          |> Enum.group_by(&today_at(&1.starts_at))

        events =
          Repo.all(
            from e in ScheduleEvent,
              where:
                e.department_id == ^dept_id and e.status == "published" and
                  e.ends_at > ^lo and e.starts_at < ^hi,
              order_by: [asc: e.starts_at, asc: e.id]
          )

        Map.new(days, &{&1, header(&1, Map.get(shifts, &1, []), events)})
    end
  end

  defp header(day, shifts, events) do
    {open, assigned} = Enum.split_with(shifts, &is_nil(&1.assignee_id))
    {lo, hi} = {Recurrence.local_midnight(day), Recurrence.local_midnight(Date.add(day, 1))}

    people =
      assigned
      |> Enum.group_by(& &1.assignee)
      |> Enum.sort_by(fn {u, _} -> {u.schedule_order, u.name, u.email} end)
      |> Enum.map(fn {user, shifts} ->
        %{user: user, shifts: shifts, hours: hours(shifts)}
      end)

    %{
      people: people,
      open_shifts: open,
      events:
        Enum.filter(
          events,
          &(DateTime.compare(&1.ends_at, lo) == :gt and DateTime.compare(&1.starts_at, hi) == :lt)
        )
    }
  end

  defp hours(shifts) do
    seconds = Enum.reduce(shifts, 0, &(&2 + DateTime.diff(&1.ends_at, &1.starts_at)))
    Float.round(seconds / 3600, 2)
  end

  ## The shift-end reminder (D40)

  @doc """
  What's still open on `dept`'s board on `day`, for `user`'s shift-end
  reminder (D38 spec §3.5):

    * `tasks`: every open task planned that day, whoever it's assigned to:
      `user`'s first, then unassigned ones, then other people's, each in
      board order, assignee preloaded;
    * `daily`: that day's Daily card as the board shows it, `%{done, total,
      unticked}` with `unticked` the open items' names in card order.

  The Future list and earlier days' tasks aren't part of it (S23h).
  """
  def open_work(%Department{} = dept, %User{id: user_id}, %Date{} = day, today \\ today()) do
    tasks =
      Repo.all(
        from t in Task,
          where: t.department_id == ^dept.id and t.due_on == ^day and is_nil(t.completed_at),
          order_by: [asc: t.position, asc: t.id],
          preload: :assignee
      )
      |> Enum.sort_by(fn t ->
        cond do
          t.assignee_id == user_id -> 0
          is_nil(t.assignee_id) -> 1
          true -> 2
        end
      end)

    %{done: done, total: total, items: rows} = daily_cards(dept, [day], today)[day]

    %{
      tasks: tasks,
      daily: %{
        done: done,
        total: total,
        unticked: for(%{item: item, check: nil} <- rows, do: item.name)
      }
    }
  end

  ## Tasks

  @doc "The task with id `id` on `dept`'s board, or nil (another board's too)."
  def get_task(%Department{id: dept_id}, id) do
    case to_int(id) do
      nil -> nil
      id -> Repo.get_by(Task, id: id, department_id: dept_id)
    end
  end

  @doc """
  True when `dept`'s History has a `deleted` entry for task `id`: someone
  deleted it (D39 O-1). An id that never existed, or another board's, is
  false.
  """
  def deleted_task?(%Department{id: dept_id}, id) do
    case to_int(id) do
      nil ->
        false

      id ->
        Repo.exists?(
          from ev in Event,
            where: ev.task_id == ^id and ev.action == "deleted" and ev.department_id == ^dept_id
        )
    end
  end

  @doc "The task with assignee, completer and creator loaded, for its JSON."
  def with_names(%Task{} = task),
    do:
      task
      |> Repo.preload([:assignee, :completed_by, :created_by, production_step: :batch],
        force: true
      )
      |> RockcutApi.Production.TaskLink.describe()

  @doc """
  Add a task at the bottom of its day, or of the Future list when `due_on` is
  empty. `attrs`: title, notes, due_on, assignee_id.

  With `repeat` (D39), it's a recurring task: `Series.create/4` makes every
  occurrence through today + 12 months and returns the first.
  """
  def create(%Department{} = dept, attrs, %User{} = actor, today \\ today()) do
    attrs = stringify(attrs)

    if Series.repeat?(attrs),
      do: Series.create(dept, attrs, actor, today),
      else: create_one(dept, attrs, actor)
  end

  defp create_one(dept, attrs, actor) do
    Repo.transaction(fn ->
      changeset =
        %Task{department_id: dept.id, created_by_id: actor.id}
        |> Task.changeset(Map.take(attrs, ~w(title notes due_on assignee_id)))
        |> validate_assignee()

      due_on = Ecto.Changeset.get_field(changeset, :due_on)
      changeset = Ecto.Changeset.put_change(changeset, :position, next_position(dept.id, due_on))

      case Repo.insert(changeset) do
        {:ok, task} ->
          log!(task, "created", actor, %{
            "due_on" => iso(task.due_on),
            "assignee_id" => task.assignee_id
          })

          task

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc """
  Edit title, notes, assignee and day. A day change is a move to the bottom
  of that day (or of the Future list for `due_on: nil`). Logs `edited`,
  `assigned` and `moved` for what changed.

  An occurrence of a recurring task (D39) goes through `Series.update/5`
  with `opts[:scope]` (`"this"` | `"following"`) and `opts[:changed]`. A
  one-off with `repeat` becomes a recurring task (`Series.make_repeating/4`,
  Decision 6).
  """
  def update(%Department{} = dept, %Task{} = task, attrs, %User{} = actor, opts \\ []) do
    with :ok <- on_board(dept, task), do: update_on_board(task, stringify(attrs), actor, opts)
  end

  defp update_on_board(%Task{series_id: id} = task, attrs, actor, opts) when not is_nil(id),
    do: Series.update(task, attrs, opts[:scope], actor, opts)

  defp update_on_board(task, attrs, actor, opts) do
    if Series.repeat?(attrs),
      do: Series.make_repeating(task, attrs, actor, opts[:today] || today()),
      else: update_one(task, attrs, actor)
  end

  @doc false
  # The D38 edit of one task. `scope` (D39) goes into the `edited` and
  # `assigned` events' detail when given. For `Series`, after `update/5` has
  # checked the board.
  def update_one(%Task{id: id}, attrs, %User{} = actor, scope \\ nil) do
    attrs = stringify(attrs)
    scoped = if scope, do: %{"scope" => scope}, else: %{}

    Repo.transaction(fn ->
      task = fetch!(id)

      changeset =
        task
        |> Task.changeset(Map.take(attrs, ~w(title notes assignee_id due_on)))
        |> validate_assignee()

      if not changeset.valid?, do: Repo.rollback(changeset)

      {day_change, changeset} =
        Ecto.Changeset.fetch_change(changeset, :due_on) |> day_change(changeset)

      with {:ok, due_on} <- day_change,
           false <- movable?(task, due_on),
           do: Repo.rollback(:locked)

      updated = Repo.update!(changeset)

      edited = Map.take(changeset.changes, [:title, :notes])

      if edited != %{} do
        log!(
          updated,
          "edited",
          actor,
          Map.merge(scoped, %{
            "from" => Map.new(edited, fn {k, _} -> {to_string(k), Map.get(task, k)} end),
            "to" => Map.new(edited, fn {k, v} -> {to_string(k), v} end)
          })
        )
      end

      if Map.has_key?(changeset.changes, :assignee_id) do
        log!(
          updated,
          "assigned",
          actor,
          Map.merge(scoped, %{"from" => task.assignee_id, "to" => updated.assignee_id})
        )
      end

      case day_change do
        :none -> updated
        {:ok, due_on} -> do_move(updated, due_on, nil, actor)
      end
    end)
  end

  defp day_change({:ok, due_on}, changeset),
    do: {{:ok, due_on}, Ecto.Changeset.delete_change(changeset, :due_on)}

  defp day_change(:error, changeset), do: {:none, changeset}

  @doc """
  Put the task on `due_on` (nil = Future) ahead of `before_id`, or last when
  `before_id` is nil or no longer in that list. Both lists are renumbered.
  A `before_id` from another board is `{:error, :not_found}` (D42 §2.2). A task with a locked card (finished away from its planned day) can't move,
  nor can a done task go to the Future list: `{:error, :locked}`.
  """
  def move(%Department{} = dept, %Task{id: id} = task, due_on, before_id, %User{} = actor) do
    with :ok <- on_board(dept, task),
         :ok <- before_on_board(dept, before_id),
         {:ok, due_on} <- cast_date(due_on) do
      Repo.transaction(fn ->
        task = fetch!(dept, id)
        if not movable?(task, due_on), do: Repo.rollback(:locked)
        do_move(task, due_on, before_id, actor)
      end)
    end
  end

  @doc """
  Move every open task planned before `today` to the bottom of today, oldest
  day first, keeping each day's order (S20). One `moved` event per task.
  Returns `{:ok, count}`. D49: not the linked tasks (their steps move with
  the move prompt, one at a time).
  """
  def move_overdue_to_today(%Department{} = dept, %User{} = actor, today \\ today()) do
    Repo.transaction(fn ->
      overdue =
        Repo.all(
          from t in Task,
            # D49: a linked task moves with its step, on the schedule's terms.
            where:
              t.department_id == ^dept.id and is_nil(t.completed_at) and t.due_on < ^today and
                is_nil(t.production_step_id)
        )
        |> Placement.unfinished(today)

      Enum.each(overdue, &do_move(&1, today, nil, actor))
      length(overdue)
    end)
  end

  @doc """
  Check a task off on `today`.

    * Its own day: no question; `display` is ignored (`planned_day`).
    * Another day: `display` (`planned_day`, `completed_day`, `both`) is
      required, else `{:error, :display_required}`.
    * A Future task: always `completed_day`; it leaves the Future list.
    * Already done: a no-op that returns it unchanged, with no event.
  """
  def complete(
        %Department{} = dept,
        %Task{id: id} = task,
        display,
        %User{} = actor,
        today \\ today()
      ) do
    with :ok <- on_board(dept, task), do: do_complete(dept, id, display, actor, today)
  end

  defp do_complete(dept, id, display, actor, today) do
    Repo.transaction(fn ->
      task = fetch!(dept, id)

      if Task.done?(task) do
        task
      else
        display = resolve_display(task, display, today)

        changeset =
          Task.completion_changeset(task, %{
            completed_at: now(),
            completed_by_id: actor.id,
            completed_on: today,
            completed_display: display
          })

        completed = Repo.update(changeset) |> ok_or_rollback()

        if is_nil(task.due_on), do: renumber(task.department_id, nil)

        log!(completed, "completed", actor, %{
          "display" => display,
          "completed_on" => iso(today),
          "due_on" => iso(task.due_on)
        })

        completed
      end
    end)
  end

  defp resolve_display(%Task{due_on: nil}, _display, _today), do: "completed_day"

  defp resolve_display(%Task{due_on: due_on}, display, today) do
    cond do
      due_on == today -> "planned_day"
      display in [nil, ""] -> Repo.rollback(:display_required)
      true -> display
    end
  end

  @doc """
  Mark a task not done: all four completion fields cleared. A Future task goes
  back to the bottom of the Future list. Not done already → a no-op.
  """
  def uncomplete(%Department{} = dept, %Task{id: id} = task, %User{} = actor) do
    with :ok <- on_board(dept, task), do: do_uncomplete(dept, id, actor)
  end

  defp do_uncomplete(dept, id, actor) do
    Repo.transaction(fn ->
      task = fetch!(dept, id)

      if Task.done?(task) do
        reopened =
          task
          |> Task.completion_changeset(%{
            completed_at: nil,
            completed_by_id: nil,
            completed_on: nil,
            completed_display: nil
          })
          |> Ecto.Changeset.put_change(:position, reopen_position(task))
          |> Repo.update()
          |> ok_or_rollback()

        log!(reopened, "uncompleted", actor, %{
          "completed_on" => iso(task.completed_on),
          "display" => task.completed_display
        })

        reopened
      else
        task
      end
    end)
  end

  defp reopen_position(%Task{due_on: nil} = t), do: next_position(t.department_id, nil)
  defp reopen_position(%Task{position: p}), do: p

  @doc """
  Delete a task. Its history stays (the event keeps a copy of the title).

  An occurrence of a recurring task (D39) goes through `Series.delete/4` with
  `opts[:scope]` and `opts[:changed]`.
  """
  def delete(%Department{} = dept, %Task{} = task, %User{} = actor, opts \\ []) do
    with :ok <- on_board(dept, task), do: delete_on_board(task, actor, opts)
  end

  defp delete_on_board(%Task{series_id: id} = task, actor, opts) when not is_nil(id),
    do: Series.delete(task, opts[:scope], actor, opts)

  defp delete_on_board(task, actor, _opts), do: delete_one(task, actor)

  @doc """
  Stop repeating after this occurrence (D39 S63, `Series.stop/3`) on `dept`'s
  board.
  """
  def stop_repeating(%Department{} = dept, %Task{} = task, %User{} = actor, opts \\ []) do
    with :ok <- on_board(dept, task), do: Series.stop(task, actor, opts)
  end

  @doc "The rule behind an occurrence on `dept`'s board and its counts (`Series.info/1`)."
  def series_info(%Department{} = dept, %Task{} = task) do
    with :ok <- on_board(dept, task), do: Series.info(task)
  end

  @doc "What a \"following\" edit with these repeat params would do (D42, `Series.change_preview/2`)."
  def series_change_preview(%Department{} = dept, %Task{} = task, attrs) do
    with :ok <- on_board(dept, task), do: Series.change_preview(task, attrs)
  end

  @doc false
  # The D38 delete of one task; `detail` adds to its `deleted` event. For
  # `Series`, after `delete/4` has checked the board.
  def delete_one(%Task{id: id}, %User{} = actor, detail \\ %{}) do
    Repo.transaction(fn ->
      task = fetch!(id)
      log!(task, "deleted", actor, Map.merge(%{"due_on" => iso(task.due_on)}, detail))
      Repo.delete!(task)
      if in_list?(task), do: renumber(task.department_id, task.due_on)
      :deleted
    end)
  end

  @doc """
  Clear `user_id` as assignee on **open** tasks on each board they can no
  longer take tasks on (S49; per department since D41, S112): leaving the
  Taproom doesn't touch their Brewery tasks, and deactivation clears every
  board. Called inside `Accounts`' user and membership transactions, beside
  `StaffCodes.clear_if_ineligible/2`. Done tasks keep the name. Each
  unassigned task is logged on its board, with reason `left_<key>`. D39:
  recurring task series assigned to them on that board are cleared too, so
  the top-up doesn't assign them new occurrences.
  """
  def unassign_if_ineligible(user_id, %User{} = actor) do
    user = Accounts.get_user!(user_id)

    for dept <- Accounts.list_departments(), not Authz.can_take_task?(user, dept) do
      Repo.update_all(
        from(s in TaskSeries, where: s.assignee_id == ^user_id and s.department_id == ^dept.id),
        set: [assignee_id: nil, updated_at: now()]
      )

      # D49: and the unfinished production steps assigned to them, so the
      # Brewery board's linked tasks (which follow their steps) agree.
      if dept.key == "brewery" do
        Repo.update_all(
          from(s in RockcutApi.Production.Step,
            where: s.assignee_id == ^user_id and is_nil(s.done_on)
          ),
          set: [assignee_id: nil, updated_at: now()]
        )
      end

      Repo.all(
        from t in Task,
          where:
            t.assignee_id == ^user_id and t.department_id == ^dept.id and is_nil(t.completed_at)
      )
      |> Enum.each(fn task ->
        task = task |> Ecto.Changeset.change(assignee_id: nil) |> Repo.update!()

        log!(task, "unassigned", actor, %{
          "from" => user_id,
          "to" => nil,
          "reason" => "left_#{dept.key}"
        })
      end)
    end

    :ok
  end

  ## Daily card

  @doc """
  The retired Daily items, by name (Edit Daily items' Retired section, D39),
  each with `deletable` set: never ticked on any day (D42 §2.4).
  """
  def list_retired_items(%Department{} = dept) do
    ticked = ever_ticked(dept)

    Repo.all(
      from i in DailyItem,
        where: i.department_id == ^dept.id and not i.active,
        order_by: [asc: i.name, asc: i.id]
    )
    |> Enum.map(&%{&1 | deletable: not MapSet.member?(ticked, &1.id)})
  end

  # Ids of `dept`'s Daily items that were ever ticked: a check now, or a
  # `daily_ticked` History entry (a tick later unticked removes the check but
  # not the entry, D42 QA gap 1).
  defp ever_ticked(%Department{} = dept) do
    checks =
      Repo.all(
        from c in DailyCheck,
          where: c.department_id == ^dept.id,
          distinct: true,
          select: c.daily_item_id
      )

    logged =
      Repo.all(
        from e in Event,
          where: e.department_id == ^dept.id and e.action == "daily_ticked",
          distinct: true,
          select: fragment("CAST(json_extract(?, '$.daily_item_id') AS INTEGER)", e.detail)
      )

    MapSet.new(checks ++ logged)
  end

  @doc "The active Daily items, in order."
  def list_items(%Department{} = dept) do
    Repo.all(
      from i in DailyItem,
        where: i.department_id == ^dept.id and i.active,
        order_by: [asc: i.position, asc: i.id]
    )
  end

  @doc "The Daily item with id `id` on `dept`'s board (active or retired), or nil."
  def get_item(%Department{id: dept_id}, id) do
    case to_int(id) do
      nil -> nil
      id -> Repo.get_by(DailyItem, id: id, department_id: dept_id)
    end
  end

  @doc """
  The Daily card for each of `days`: `%{date => %{items: [%{item, check}],
  done: n, total: n}}`. One query per kind for the whole range.

    * Today and past days show, and count, the active items that existed
      then (created on or before that Colorado day) and weren't retired then
      (`retired_spans/1`), plus any item ticked that day (an item ticked
      today, then retired, still shows ticked).
    * Future days show the active items.
  """
  def daily_cards(%Department{} = dept, days, today \\ today()) do
    days = Enum.to_list(days)

    items =
      Repo.all(
        from i in DailyItem,
          where: i.department_id == ^dept.id,
          order_by: [asc: i.position, asc: i.id]
      )

    checks =
      case days do
        [] ->
          %{}

        _ ->
          {first, last} = Enum.min_max_by(days, &Date.to_gregorian_days/1)

          Repo.all(
            from c in DailyCheck,
              where: c.department_id == ^dept.id and c.on_date >= ^first and c.on_date <= ^last,
              preload: :completed_by
          )
          |> Map.new(&{{&1.on_date, &1.daily_item_id}, &1})
      end

    spans = retired_spans()
    Map.new(days, &{&1, daily_card(&1, items, checks, spans, today)})
  end

  defp daily_card(day, items, checks, spans, today) do
    started? = Date.compare(day, today) != :gt

    rows =
      items
      |> Enum.map(&%{item: &1, check: Map.get(checks, {day, &1.id})})
      |> Enum.filter(fn %{item: item, check: check} ->
        if started?,
          do: check != nil or (item.active and in_list_on?(item, day, spans)),
          else: item.active
      end)

    %{items: rows, done: Enum.count(rows, &(&1.check != nil)), total: length(rows)}
  end

  defp existed_on?(%DailyItem{inserted_at: at}, day),
    do: Date.compare(today_at(at), day) != :gt

  defp in_list_on?(%DailyItem{} = item, day, spans),
    do: existed_on?(item, day) and not retired_on?(spans, item.id, day)

  defp retired_on?(spans, item_id, day) do
    spans
    |> Map.get(item_id, [])
    |> Enum.any?(fn {from, to} ->
      Date.compare(from, day) != :gt and Date.compare(day, to) != :gt
    end)
  end

  @doc """
  The Colorado days each restored Daily item was off the list (D39 Decision
  5): `%{item_id => [{first, last}]}`, from its `item_retired` and
  `item_restored` events, oldest first.

  Retired on day R and restored on day S, it's out on R through S - 1:

    * R is out: while retired, R's card didn't show it, so restoring doesn't
      change R's count. A tick on R (made before retiring) still shows, as
      every tick does.
    * S is in: it's back on the list that day and can be ticked.
    * Retired and restored the same day: no span, the day keeps it.

  An item still retired has an open span; `active: false` already keeps it
  off every card. One query for all items (or just `item_id`).
  """
  def retired_spans(item_id \\ nil) do
    query =
      from e in Event,
        where: e.action in ["item_retired", "item_restored"],
        order_by: [asc: e.inserted_at, asc: e.id]

    query
    |> Repo.all()
    |> Enum.filter(&(item_id == nil or &1.detail["daily_item_id"] == item_id))
    |> Enum.group_by(& &1.detail["daily_item_id"])
    |> Map.new(fn {id, events} -> {id, spans_from(events)} end)
  end

  defp spans_from(events) do
    {spans, _open} =
      Enum.reduce(events, {[], nil}, fn
        %Event{action: "item_retired"} = e, {spans, nil} ->
          {spans, today_at(e.inserted_at)}

        %Event{action: "item_restored"} = e, {spans, %Date{} = from} ->
          to = Date.add(today_at(e.inserted_at), -1)
          {if(Date.compare(from, to) == :gt, do: spans, else: [{from, to} | spans]), nil}

        _, acc ->
          acc
      end)

    Enum.reverse(spans)
  end

  defp not_retired_on(%DailyItem{active: false}, _on_date), do: {:error, :retired}

  defp not_retired_on(%DailyItem{id: id}, on_date) do
    if retired_on?(retired_spans(id), id, on_date), do: {:error, :retired}, else: :ok
  end

  @doc """
  Tick `item` on `on_date`. A future date → `{:error, :future_day}`; a retired
  item, or a day it was retired (D39 Decision 5) → `{:error, :retired}`; a
  day before the item was added → `{:error, :not_yet_added}`. Ticking twice
  is a no-op (no second event).
  """
  def tick(%Department{} = dept, on_date, %DailyItem{} = item, %User{} = actor, today \\ today()) do
    with :ok <- on_board(dept, item),
         {:ok, on_date} <- cast_date(on_date),
         :ok <- not_future(on_date, today),
         :ok <- not_retired_on(item, on_date),
         :ok <- if(existed_on?(item, on_date), do: :ok, else: {:error, :not_yet_added}) do
      Repo.transaction(fn ->
        {:ok, check} =
          Repo.insert(
            %DailyCheck{
              department_id: item.department_id,
              on_date: on_date,
              daily_item_id: item.id,
              completed_by_id: actor.id,
              completed_at: now()
            },
            on_conflict: :nothing,
            conflict_target: [:on_date, :daily_item_id]
          )

        if check.id, do: log_daily!(item, "daily_ticked", actor, on_date)
        Repo.get_by!(DailyCheck, on_date: on_date, daily_item_id: item.id)
      end)
    end
  end

  @doc """
  Untick `item` on `on_date`. Not ticked → a no-op. A future date →
  `{:error, :future_day}`. A retired item, or a day it was retired →
  `{:error, :retired}`: its ticks are kept (D39 Decisions 1 and 5).
  """
  def untick(
        %Department{} = dept,
        on_date,
        %DailyItem{} = item,
        %User{} = actor,
        today \\ today()
      ) do
    with :ok <- on_board(dept, item),
         {:ok, on_date} <- cast_date(on_date),
         :ok <- not_future(on_date, today),
         :ok <- not_retired_on(item, on_date) do
      Repo.transaction(fn ->
        {n, _} =
          Repo.delete_all(
            from c in DailyCheck, where: c.on_date == ^on_date and c.daily_item_id == ^item.id
          )

        if n > 0, do: log_daily!(item, "daily_unticked", actor, on_date)
        :ok
      end)
    end
  end

  defp not_future(on_date, today),
    do: if(Date.compare(on_date, today) == :gt, do: {:error, :future_day}, else: :ok)

  @doc """
  Add a Daily item at the bottom. At most #{@max_items} active
  (`{:error, :too_many_items}`); names unique among active items, ignoring
  case (a changeset error "Already on the list").
  """
  def create_item(%Department{} = dept, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      active = list_items(dept)
      if length(active) >= @max_items, do: Repo.rollback(:too_many_items)

      item =
        %DailyItem{department_id: dept.id, position: length(active) + 1}
        |> DailyItem.changeset(stringify(attrs))
        |> unique_name(active)
        |> Repo.insert()
        |> ok_or_rollback()

      log_item!(item, "item_added", actor, %{"daily_item_id" => item.id})
      item
    end)
  end

  @doc "Rename an active Daily item. The new name shows on past days too."
  def rename_item(%Department{} = dept, %DailyItem{id: id} = item, name, %User{} = actor) do
    with :ok <- on_board(dept, item), do: do_rename_item(dept, id, name, actor)
  end

  defp do_rename_item(dept, id, name, actor) do
    Repo.transaction(fn ->
      item = active_item!(dept, id)

      changeset =
        item
        |> DailyItem.changeset(%{"name" => name})
        |> unique_name(Enum.reject(list_items(dept), &(&1.id == id)))

      renamed = Repo.update(changeset) |> ok_or_rollback()

      if renamed.name != item.name do
        log_item!(renamed, "item_renamed", actor, %{
          "daily_item_id" => id,
          "from" => item.name,
          "to" => renamed.name
        })
      end

      renamed
    end)
  end

  @doc "Retire an active Daily item. Past ticks are kept; the rest close up."
  def retire_item(%Department{} = dept, %DailyItem{id: id} = item, %User{} = actor) do
    with :ok <- on_board(dept, item), do: do_retire_item(dept, id, actor)
  end

  defp do_retire_item(dept, id, actor) do
    Repo.transaction(fn ->
      item = active_item!(dept, id)
      retired = item |> Ecto.Changeset.change(active: false) |> Repo.update!()
      list_items(dept) |> Enum.map(& &1.id) |> write_item_order()
      log_item!(retired, "item_retired", actor, %{"daily_item_id" => id})
      retired
    end)
  end

  @doc """
  Bring a retired Daily item back (D39, S75): at the bottom of the list, with
  its past ticks. It counts against the #{@max_items}-item cap
  (`{:error, :too_many_items}`) and against the active names, ignoring case
  (a changeset error "Already on the list"). Logs `item_restored`. An active
  item is returned unchanged.

  Only `active` and its place change. The days it was retired stay without it
  (`retired_spans/1`, D39 Decision 5); the days before show it again, ticked
  or not.
  """
  def restore_item(%Department{} = dept, %DailyItem{id: id} = item, %User{} = actor) do
    with :ok <- on_board(dept, item), do: do_restore_item(dept, id, actor)
  end

  defp do_restore_item(dept, id, actor) do
    Repo.transaction(fn ->
      item = get_item(dept, id) || Repo.rollback(:not_found)

      if item.active do
        item
      else
        active = list_items(dept)
        if length(active) >= @max_items, do: Repo.rollback(:too_many_items)

        restored =
          item
          |> Ecto.Changeset.change(active: true, position: length(active) + 1)
          |> unique_name(active)
          |> Repo.update()
          |> ok_or_rollback()

        log_item!(restored, "item_restored", actor, %{"daily_item_id" => id})
        restored
      end
    end)
  end

  @doc """
  Delete a retired Daily item that was never ticked (D42 §2.4): an active one
  is `{:error, :not_retired}`, one with any tick `{:error, :has_ticks}`. Logs
  `item_deleted`; its earlier History rows stay.
  """
  def delete_item(%Department{} = dept, %DailyItem{id: id} = item, %User{} = actor) do
    with :ok <- on_board(dept, item), do: do_delete_item(dept, id, actor)
  end

  defp do_delete_item(dept, id, actor) do
    Repo.transaction(fn ->
      item = get_item(dept, id) || Repo.rollback(:not_found)
      if item.active, do: Repo.rollback(:not_retired)

      if MapSet.member?(ever_ticked(dept), id), do: Repo.rollback(:has_ticks)

      Repo.delete!(item)
      log_item!(item, "item_deleted", actor, %{"daily_item_id" => id})
      :ok
    end)
  end

  @doc """
  Reorder the active items. `ids` must be exactly the active items' ids, else
  `{:error, :invalid_order}`. Returns the items in their new order.
  """
  def order_items(dept, ids, actor)

  def order_items(%Department{} = dept, ids, %User{} = actor) when is_list(ids) do
    Repo.transaction(fn ->
      current = list_items(dept) |> Enum.map(& &1.id)
      ids = Enum.map(ids, &to_int/1)

      if Enum.sort(ids) != Enum.sort(current) or length(Enum.uniq(ids)) != length(ids),
        do: Repo.rollback(:invalid_order)

      if ids != current do
        write_item_order(ids)

        Repo.insert!(%Event{
          department_id: dept.id,
          action: "item_reordered",
          actor_id: actor.id,
          device_id: actor.on_device_id,
          title: "Daily items",
          detail: %{"from" => current, "to" => ids}
        })
      end

      list_items(dept)
    end)
  end

  def order_items(%Department{}, _ids, _actor), do: {:error, :invalid_order}

  defp active_item!(dept, id) do
    case get_item(dept, id) do
      %DailyItem{active: true} = item -> item
      %DailyItem{} -> Repo.rollback(:retired)
      nil -> Repo.rollback(:not_found)
    end
  end

  defp unique_name(changeset, others) do
    name = Ecto.Changeset.get_field(changeset, :name)

    if is_binary(name) and
         Enum.any?(others, &(String.downcase(&1.name) == String.downcase(name))),
       do: Ecto.Changeset.add_error(changeset, :name, "Already on the list"),
       else: changeset
  end

  defp write_item_order(ids) do
    ids
    |> Enum.with_index(1)
    |> Enum.each(fn {id, position} ->
      Repo.update_all(from(i in DailyItem, where: i.id == ^id), set: [position: position])
    end)
  end

  ## History

  @doc """
  `dept`'s change log, newest first, #{@history_page_size} per page
  (1-based), optionally for one task. Actor and device preloaded. Returns
  `%{events: [...], page: n, total: count, names: %{users: .., items: ..}}`:
  `names` maps the user ids (assignees) and Daily item ids (a reorder) that
  the page's `detail`s mention to their current names, so History reads in
  words. Someone or something since deleted is simply missing.
  """
  def list_events(%Department{id: dept_id}, task_id \\ nil, page \\ 1) do
    page = max(page, 1)
    board = from(ev in Event, where: ev.department_id == ^dept_id)

    base =
      case task_id do
        nil -> board
        id -> from(ev in board, where: ev.task_id == ^id)
      end

    events =
      Repo.all(
        from ev in base,
          order_by: [desc: ev.id],
          limit: @history_page_size,
          offset: ^((page - 1) * @history_page_size),
          preload: [:actor, :device]
      )

    %{events: events, page: page, total: Repo.aggregate(base, :count), names: event_names(events)}
  end

  @user_detail_actions ~w(created assigned unassigned edited)

  defp event_names(events) do
    user_ids =
      events
      |> Enum.filter(&(&1.action in @user_detail_actions))
      |> Enum.flat_map(&detail_user_ids(&1.detail))
      |> Enum.filter(&is_integer/1)
      |> Enum.uniq()

    item_ids =
      events
      |> Enum.filter(&(&1.action == "item_reordered"))
      |> Enum.flat_map(&((&1.detail["from"] || []) ++ (&1.detail["to"] || [])))
      |> Enum.filter(&is_integer/1)
      |> Enum.uniq()

    %{
      users:
        Repo.all(from u in User, where: u.id in ^user_ids, select: {u.id, u.name}) |> Map.new(),
      items:
        Repo.all(from i in DailyItem, where: i.id in ^item_ids, select: {i.id, i.name})
        |> Map.new()
    }
  end

  # Assignees an event mentions: `assignee_id`, or `from`/`to` as ids or (an
  # `edited` event, D39) as maps with an `assignee_id`.
  defp detail_user_ids(detail) do
    [detail["assignee_id"] | Enum.map([detail["from"], detail["to"]], &assignee_in/1)]
  end

  defp assignee_in(%{} = values), do: values["assignee_id"]
  defp assignee_in(value), do: value

  ## Lists and positions

  # Take the task out of its list, put it into `due_on`'s list ahead of
  # `before_id` (or last), renumber both, and log the move. Runs inside the
  # caller's transaction.
  #
  # D39: an occurrence moved to another day becomes an exception; moved onto
  # the Future list it becomes a one-off (Decision 4) and its date is skipped.
  defp do_move(%Task{} = task, due_on, before_id, actor) do
    was = %{"due_on" => iso(task.due_on), "position" => task.position}
    dept_id = task.department_id

    target =
      list_ids(dept_id, due_on)
      |> List.delete(task.id)

    index =
      case before_id && Enum.find_index(target, &(&1 == to_int(before_id))) do
        nil -> length(target)
        i -> i
      end

    ids = List.insert_at(target, index, task.id)

    series_set = moved_series_fields(task, due_on)

    Repo.update_all(from(t in Task, where: t.id == ^task.id),
      set: [due_on: due_on, updated_at: now()] ++ series_set
    )

    write_order(ids)
    if task.due_on != due_on, do: renumber(dept_id, task.due_on)

    moved = Repo.get!(Task, task.id)

    if was != %{"due_on" => iso(moved.due_on), "position" => moved.position} do
      log!(
        moved,
        "moved",
        actor,
        %{
          "from" => was,
          "to" => %{"due_on" => iso(moved.due_on), "position" => moved.position}
        }
        |> Map.merge(
          if task.series_id && is_nil(moved.series_id), do: %{"one_off" => true}, else: %{}
        )
      )
    end

    moved
  end

  defp moved_series_fields(%Task{series_id: nil}, _due_on), do: []
  defp moved_series_fields(%Task{due_on: same}, same), do: []

  defp moved_series_fields(%Task{} = task, nil) do
    Series.skip_date!(task.series_id, task.series_date)
    [series_id: nil, series_date: nil, series_exception: false]
  end

  defp moved_series_fields(%Task{}, _day), do: [series_exception: true]

  # A day's list: every task on that day. The Future list: open tasks with no day.
  defp list_query(dept_id, nil),
    do:
      from(t in Task,
        where: t.department_id == ^dept_id and is_nil(t.due_on) and is_nil(t.completed_at)
      )

  defp list_query(dept_id, %Date{} = day),
    do: from(t in Task, where: t.department_id == ^dept_id and t.due_on == ^day)

  defp list_ids(dept_id, due_on) do
    Repo.all(
      from t in list_query(dept_id, due_on),
        order_by: [asc: t.position, asc: t.id],
        select: t.id
    )
  end

  defp renumber(dept_id, due_on), do: dept_id |> list_ids(due_on) |> write_order()

  @doc false
  # Close up each of `days`' lists after a bulk removal (D39 series).
  def renumber_days(dept_id, days), do: days |> Enum.uniq() |> Enum.each(&renumber(dept_id, &1))

  @doc """
  Renumber every list (each day and the Future list) and the active Daily
  items densely, keeping their order. For bulk deletes made outside this
  module (the synthetic seed's cleanup).
  """
  def compact_lists(%Department{} = dept) do
    Repo.all(from t in Task, where: t.department_id == ^dept.id, distinct: true, select: t.due_on)
    |> Enum.each(&renumber(dept.id, &1))

    list_items(dept) |> Enum.map(& &1.id) |> write_item_order()
    :ok
  end

  defp write_order(ids) do
    ids
    |> Enum.with_index(1)
    |> Enum.each(fn {id, position} ->
      Repo.update_all(from(t in Task, where: t.id == ^id and t.position != ^position),
        set: [position: position]
      )
    end)
  end

  @doc false
  def next_position(dept_id, due_on) do
    (Repo.one(from t in list_query(dept_id, due_on), select: max(t.position)) || 0) + 1
  end

  defp in_list?(%Task{due_on: nil} = t), do: not Task.done?(t)
  defp in_list?(%Task{}), do: true

  @doc """
  True when a task's card can't be dragged: it's done and shows on the day it
  was finished, away from its planned day (or both days, or from Future).
  """
  def locked?(%Task{completed_at: nil}), do: false
  def locked?(%Task{due_on: nil}), do: true
  def locked?(%Task{due_on: same, completed_on: same}), do: false
  def locked?(%Task{completed_display: display}), do: display in ~w(completed_day both)

  # A locked task can't move, and a done task can't go to the Future list
  # (the list holds open tasks only).
  defp movable?(task, due_on),
    do: not locked?(task) and not (Task.done?(task) and is_nil(due_on))

  ## Validation

  @doc false
  # The assignee must be able to take a task on the record's board (its
  # `department_id`): an active member of that department, or an owner.
  def validate_assignee(changeset) do
    case Ecto.Changeset.get_change(changeset, :assignee_id) do
      nil ->
        changeset

      id ->
        dept_id = Ecto.Changeset.get_field(changeset, :department_id)

        if assignable?(Accounts.get_user(id), dept_id),
          do: changeset,
          else: Ecto.Changeset.add_error(changeset, :assignee_id, assignee_error(dept_id))
    end
  end

  defp assignable?(%User{} = user, dept_id), do: Authz.can_take_task?(user, dept_id)
  defp assignable?(nil, _dept_id), do: false

  defp assignee_error(dept_id) do
    case Repo.get(Department, dept_id) do
      %Department{name: name} -> "must be a #{name} member"
      nil -> "must be a member"
    end
  end

  ## Helpers

  # A task or Daily item given for `dept`'s board must be on it.
  defp on_board(%Department{id: id}, %{department_id: id}), do: :ok
  defp on_board(%Department{}, _record), do: {:error, :not_found}

  # A move's `before_id` names a task on `dept`'s board, or none that exists
  # (gone since the client loaded: the task goes last, D38).
  defp before_on_board(%Department{} = dept, before_id) do
    case to_int(before_id) && Repo.get(Task, to_int(before_id)) do
      nil -> :ok
      task -> on_board(dept, task)
    end
  end

  # Inside a transaction: the task by id, on `dept`'s board.
  defp fetch!(%Department{} = dept, id), do: get_task(dept, id) || Repo.rollback(:not_found)

  # By id alone, for `update_one/4` and `delete_one/3`, whose callers have
  # already checked the board.
  defp fetch!(id), do: Repo.get(Task, id) || Repo.rollback(:not_found)

  defp log!(%Task{} = task, action, actor, detail) do
    Repo.insert!(%Event{
      department_id: task.department_id,
      task_id: task.id,
      action: action,
      actor_id: actor.id,
      device_id: actor.on_device_id,
      title: task.title,
      detail: detail
    })
  end

  defp log_daily!(item, action, actor, on_date),
    do: log_item!(item, action, actor, %{"on_date" => iso(on_date), "daily_item_id" => item.id})

  defp log_item!(item, action, actor, detail) do
    Repo.insert!(%Event{
      department_id: item.department_id,
      action: action,
      actor_id: actor.id,
      device_id: actor.on_device_id,
      title: item.name,
      detail: detail
    })
  end

  defp ok_or_rollback({:ok, value}), do: value
  defp ok_or_rollback({:error, reason}), do: Repo.rollback(reason)

  defp cast_date(nil), do: {:ok, nil}
  defp cast_date(""), do: {:ok, nil}
  defp cast_date(%Date{} = d), do: {:ok, d}

  defp cast_date(s) when is_binary(s) do
    case Date.from_iso8601(s) do
      {:ok, d} -> {:ok, d}
      _ -> {:error, :invalid_date}
    end
  end

  defp cast_date(_), do: {:error, :invalid_date}

  defp to_int(i) when is_integer(i), do: i

  defp to_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, ""} -> i
      _ -> nil
    end
  end

  defp to_int(_), do: nil

  defp iso(nil), do: nil
  defp iso(%Date{} = d), do: Date.to_iso8601(d)

  defp stringify(attrs), do: Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)

  @doc false
  def max_items, do: @max_items

  @doc false
  def history_page_size, do: @history_page_size
end
