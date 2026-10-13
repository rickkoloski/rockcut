defmodule RockcutApi.BreweryTasks do
  @moduledoc """
  The Brewery task board (D38): tasks planned on days or on the Future list,
  the Daily card, and the change log (`brewery_task_events`). Which cards show
  on a day is decided only by `Placement`.

  "Today" is the Colorado date, never the server's (Fly runs in UTC). Every
  function that needs it takes it as an optional last argument so tests can
  pin it.

  Callers authorize first (`Authz.can?(person, :write, :brewery_tasks)` and
  friends) and pass the acting person. The context validates data only. Every
  write runs in one transaction with its event row(s).

  **Lists.** A day's list is every task with that `due_on`, done or not (a
  task done "in place" keeps its spot). The Future list is the open tasks
  with no `due_on`; a task finished from it leaves the list. `position` is
  dense (1, 2, 3, …) within each list after every write.
  """
  import Ecto.Query, only: [from: 1, from: 2]

  alias RockcutApi.{Accounts, Authz, Repo}
  alias RockcutApi.Accounts.{Department, User}

  alias RockcutApi.BreweryTasks.{
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

  @doc "The Brewery department (the only board in D38). Raises if missing."
  def department!, do: Repo.get_by!(Department, key: "brewery")

  ## The board

  @max_range_days 31

  @doc """
  The board's read model for `from..to` (at most #{@max_range_days} days,
  `from` ≤ `to`, else `{:error, :range_too_long}`):

    * `days`: each day in the range with its `cards` (through `Placement`),
      its `header` (published Brewery shifts and events) and its `daily`
      card;
    * `unfinished`: every open task planned before `today`, whatever the
      range, oldest day first;
    * `future`: the Future list.

  Names are preloaded once. One query per kind for the whole range.
  """
  def board(%Date{} = from, %Date{} = to, today \\ today()) do
    if Date.compare(from, to) == :gt or Date.diff(to, from) >= @max_range_days do
      {:error, :range_too_long}
    else
      dept = department!()
      days = Date.range(from, to) |> Enum.to_list()
      tasks = board_tasks(dept.id, from, to, today)
      cards = Placement.cards(tasks, days, today)
      headers = headers(dept.id, days)
      daily = daily_cards(days, today)

      {:ok,
       %{
         from: from,
         to: to,
         today: today,
         days:
           Enum.map(days, fn day ->
             %{date: day, cards: cards[day], header: headers[day], daily: daily[day]}
           end),
         unfinished: tasks |> Placement.unfinished(today) |> Enum.map(&unfinished_card/1),
         future: cards[:future]
       }}
    end
  end

  def max_range_days, do: @max_range_days

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
        preload: [:assignee, :completed_by, :created_by]
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

    * `people`: one entry per person with published Brewery shifts starting
      that day, their shifts in time order and total `hours`, in roster order
      (`schedule_order`, then name);
    * `open_shifts`: published, unassigned Brewery shifts that day;
    * `events`: published Brewery schedule events overlapping that day.

  Drafts, shift notes and time off are never shown. One query each for shifts
  and events across the whole range.
  """
  def headers(dept_id, days) do
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

  ## Tasks

  def get_task(id), do: Repo.get(Task, id)

  @doc """
  True when History has a `deleted` entry for task `id`: someone deleted it
  (D39 O-1). An id that never existed is false.
  """
  def deleted_task?(id) do
    case to_int(id) do
      nil -> false
      id -> Repo.exists?(from ev in Event, where: ev.task_id == ^id and ev.action == "deleted")
    end
  end

  @doc "The task with assignee, completer and creator loaded, for its JSON."
  def with_names(%Task{} = task),
    do: Repo.preload(task, [:assignee, :completed_by, :created_by], force: true)

  @doc """
  Add a task at the bottom of its day, or of the Future list when `due_on` is
  empty. `attrs`: title, notes, due_on, assignee_id.

  With `repeat` (D39), it's a recurring task: `Series.create/3` makes every
  occurrence through today + 12 months and returns the first.
  """
  def create(attrs, %User{} = actor, today \\ today()) do
    attrs = stringify(attrs)

    if Series.repeat?(attrs),
      do: Series.create(attrs, actor, today),
      else: create_one(attrs, actor)
  end

  defp create_one(attrs, actor) do
    dept = department!()

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
  with `opts[:scope]` (`"this"` | `"following"`) and `opts[:changed]`.
  """
  def update(task, attrs, actor, opts \\ [])

  def update(%Task{series_id: id} = task, attrs, %User{} = actor, opts) when not is_nil(id),
    do: Series.update(task, stringify(attrs), opts[:scope], actor, opts)

  def update(%Task{} = task, attrs, %User{} = actor, _opts),
    do: update_one(task, attrs, actor)

  @doc false
  # The D38 edit of one task. `scope` (D39) goes into the `edited` and
  # `assigned` events' detail when given.
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
  A task with a locked card (finished away from its planned day) can't move,
  nor can a done task go to the Future list: `{:error, :locked}`.
  """
  def move(%Task{id: id}, due_on, before_id, %User{} = actor) do
    with {:ok, due_on} <- cast_date(due_on) do
      Repo.transaction(fn ->
        task = fetch!(id)
        if not movable?(task, due_on), do: Repo.rollback(:locked)
        do_move(task, due_on, before_id, actor)
      end)
    end
  end

  @doc """
  Move every open task planned before `today` to the bottom of today, oldest
  day first, keeping each day's order (S20). One `moved` event per task.
  Returns `{:ok, count}`.
  """
  def move_overdue_to_today(%User{} = actor, today \\ today()) do
    dept = department!()

    Repo.transaction(fn ->
      overdue =
        Repo.all(
          from t in Task,
            where: t.department_id == ^dept.id and is_nil(t.completed_at) and t.due_on < ^today
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
  def complete(%Task{id: id}, display, %User{} = actor, today \\ today()) do
    Repo.transaction(fn ->
      task = fetch!(id)

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
  def uncomplete(%Task{id: id}, %User{} = actor) do
    Repo.transaction(fn ->
      task = fetch!(id)

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
  def delete(task, actor, opts \\ [])

  def delete(%Task{series_id: id} = task, %User{} = actor, opts) when not is_nil(id),
    do: Series.delete(task, opts[:scope], actor, opts)

  def delete(%Task{} = task, %User{} = actor, _opts), do: delete_one(task, actor)

  @doc false
  # The D38 delete of one task; `detail` adds to its `deleted` event.
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
  Clear `user_id` as assignee on **open** tasks when they're no longer an
  active Brewery person (S49). Called inside `Accounts`' user and membership
  transactions, beside `StaffCodes.clear_if_ineligible/2`. Done tasks keep
  the name. D39: recurring task series assigned to them are cleared too, so
  the top-up doesn't assign them new occurrences.
  """
  def unassign_if_ineligible(user_id, %User{} = actor) do
    user = Accounts.get_user!(user_id)

    if not assignable?(user) do
      Repo.update_all(from(s in TaskSeries, where: s.assignee_id == ^user_id),
        set: [assignee_id: nil, updated_at: now()]
      )

      Repo.all(from t in Task, where: t.assignee_id == ^user_id and is_nil(t.completed_at))
      |> Enum.each(fn task ->
        task = task |> Ecto.Changeset.change(assignee_id: nil) |> Repo.update!()

        log!(task, "unassigned", actor, %{
          "from" => user_id,
          "to" => nil,
          "reason" => "left_brewery"
        })
      end)
    end

    :ok
  end

  ## Daily card

  @doc "The active Daily items, in order."
  def list_items do
    dept = department!()

    Repo.all(
      from i in DailyItem,
        where: i.department_id == ^dept.id and i.active,
        order_by: [asc: i.position, asc: i.id]
    )
  end

  def get_item(id), do: Repo.get(DailyItem, id)

  @doc """
  The Daily card for each of `days`: `%{date => %{items: [%{item, check}],
  done: n, total: n}}`. One query per kind for the whole range.

    * Today and past days show, and count, the active items that existed
      then (created on or before that Colorado day) plus any item ticked that
      day (an item ticked today, then retired, still shows ticked).
    * Future days show the active items.
  """
  def daily_cards(days, today \\ today()) do
    dept = department!()
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

    Map.new(days, &{&1, daily_card(&1, items, checks, today)})
  end

  defp daily_card(day, items, checks, today) do
    started? = Date.compare(day, today) != :gt

    rows =
      items
      |> Enum.map(&%{item: &1, check: Map.get(checks, {day, &1.id})})
      |> Enum.filter(fn %{item: item, check: check} ->
        if started?,
          do: check != nil or (item.active and existed_on?(item, day)),
          else: item.active
      end)

    %{items: rows, done: Enum.count(rows, &(&1.check != nil)), total: length(rows)}
  end

  defp existed_on?(%DailyItem{inserted_at: at}, day),
    do: Date.compare(today_at(at), day) != :gt

  @doc """
  Tick `item` on `on_date`. A future date → `{:error, :future_day}`; a retired
  item → `{:error, :retired}`; a day before the item was added →
  `{:error, :not_yet_added}`. Ticking twice is a no-op (no second event).
  """
  def tick(on_date, %DailyItem{} = item, %User{} = actor, today \\ today()) do
    with {:ok, on_date} <- cast_date(on_date),
         :ok <- not_future(on_date, today),
         :ok <- if(item.active, do: :ok, else: {:error, :retired}),
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
  `{:error, :future_day}`. A retired item → `{:error, :retired}`: its ticks
  are kept (D39 Decision 1, O-3).
  """
  def untick(on_date, %DailyItem{} = item, %User{} = actor, today \\ today()) do
    with {:ok, on_date} <- cast_date(on_date),
         :ok <- not_future(on_date, today),
         :ok <- if(item.active, do: :ok, else: {:error, :retired}) do
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
  def create_item(attrs, %User{} = actor) do
    dept = department!()

    Repo.transaction(fn ->
      active = list_items()
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
  def rename_item(%DailyItem{id: id}, name, %User{} = actor) do
    Repo.transaction(fn ->
      item = active_item!(id)

      changeset =
        item
        |> DailyItem.changeset(%{"name" => name})
        |> unique_name(Enum.reject(list_items(), &(&1.id == id)))

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
  def retire_item(%DailyItem{id: id}, %User{} = actor) do
    Repo.transaction(fn ->
      item = active_item!(id)
      retired = item |> Ecto.Changeset.change(active: false) |> Repo.update!()
      list_items() |> Enum.map(& &1.id) |> write_item_order()
      log_item!(retired, "item_retired", actor, %{"daily_item_id" => id})
      retired
    end)
  end

  @doc """
  Reorder the active items. `ids` must be exactly the active items' ids, else
  `{:error, :invalid_order}`. Returns the items in their new order.
  """
  def order_items(ids, %User{} = actor) when is_list(ids) do
    Repo.transaction(fn ->
      current = list_items() |> Enum.map(& &1.id)
      ids = Enum.map(ids, &to_int/1)

      if Enum.sort(ids) != Enum.sort(current) or length(Enum.uniq(ids)) != length(ids),
        do: Repo.rollback(:invalid_order)

      if ids != current do
        write_item_order(ids)

        Repo.insert!(%Event{
          action: "item_reordered",
          actor_id: actor.id,
          title: "Daily items",
          detail: %{"from" => current, "to" => ids}
        })
      end

      list_items()
    end)
  end

  def order_items(_ids, _actor), do: {:error, :invalid_order}

  defp active_item!(id) do
    case Repo.get(DailyItem, id) do
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
  The change log, newest first, #{@history_page_size} per page (1-based),
  optionally for one task. Actor and device preloaded. Returns
  `%{events: [...], page: n, total: count, names: %{users: .., items: ..}}`:
  `names` maps the user ids (assignees) and Daily item ids (a reorder) that
  the page's `detail`s mention to their current names, so History reads in
  words. Someone or something since deleted is simply missing.
  """
  def list_events(task_id \\ nil, page \\ 1) do
    page = max(page, 1)

    base =
      case task_id do
        nil -> from(ev in Event)
        id -> from(ev in Event, where: ev.task_id == ^id)
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
  def compact_lists do
    dept = department!()

    Repo.all(from t in Task, where: t.department_id == ^dept.id, distinct: true, select: t.due_on)
    |> Enum.each(&renumber(dept.id, &1))

    list_items() |> Enum.map(& &1.id) |> write_item_order()
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

  defp next_position(dept_id, due_on) do
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
  def validate_assignee(changeset) do
    case Ecto.Changeset.get_change(changeset, :assignee_id) do
      nil ->
        changeset

      id ->
        if assignable?(Accounts.get_user(id)),
          do: changeset,
          else: Ecto.Changeset.add_error(changeset, :assignee_id, "must be a Brewery member")
    end
  end

  defp assignable?(%User{} = user), do: Authz.can_take_brewery_task?(user)
  defp assignable?(nil), do: false

  ## Helpers

  defp fetch!(id), do: Repo.get(Task, id) || Repo.rollback(:not_found)

  defp log!(%Task{} = task, action, actor, detail) do
    Repo.insert!(%Event{
      task_id: task.id,
      action: action,
      actor_id: actor.id,
      title: task.title,
      detail: detail
    })
  end

  defp log_daily!(item, action, actor, on_date),
    do: log_item!(item, action, actor, %{"on_date" => iso(on_date), "daily_item_id" => item.id})

  defp log_item!(item, action, actor, detail) do
    Repo.insert!(%Event{action: action, actor_id: actor.id, title: item.name, detail: detail})
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
