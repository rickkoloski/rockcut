defmodule RockcutApi.Tasks.Series do
  @moduledoc """
  Recurring tasks (D39, spec §3.10), used through `RockcutApi.Tasks`.
  Follows D32's `Scheduling.EventSeries`: a `TaskSeries` rule row plus a real
  `Task` per date. A series and its occurrences are on one department's board
  (D41). The functions here that take a task or series act on the board it's
  on; `Tasks` checks the board first.

  Occurrences are always kept through `Recurrence.rolling_horizon/2` (today
  plus 12 months, inclusive): `create/4` generates them, and `top_up/1`, run
  by the D22 scanner, adds the new dates each day, for every board's series. Each one goes at the bottom
  of its day. `series_id` + `series_date` is unique, so a date is never made
  twice.

  Repeat params are flat: `repeat` (`weekly` | `monthly` | `quarterly` |
  `annually`; `never` or empty for none), `repeat_interval`,
  `repeat_weekdays`, `repeat_month_rule` (`day` | `weekday`),
  `repeat_day_of_month`, `repeat_week_of_month`, `repeat_weekday`,
  `repeat_until` (a date) or `repeat_count`.

  **Changing one** (spec "Changing one"). Edits and deletes of an occurrence
  take a scope, `"this"` or `"following"`; without one they answer
  `{:error, :scope_required}`, except an edit that only changes the day.
  "Following" is decided by `series_date`, and never changes a finished
  occurrence. Removing later occurrences (a rule split, delete "following",
  `stop/3`) keeps the ones changed on their own (`series_exception`, or
  their own notes since D42) unless
  `changed: :remove` (Decision 2). A day change always applies to one
  occurrence and makes it an exception; onto the Future list it makes it a
  one-off (`Tasks` moves). One History event per series action
  (Decision 3).

  **The chain (G1).** To the person a split series is still one ↻ task: the
  new series records the one it continues (`continues_series_id`). Every
  "following" action, and `preview/1`, covers the acted-on series from the
  occurrence's date **and every series that continues it**, transitively
  (`continuations/1`). After an action, each continuing series with nothing
  left is deleted; one with finished or kept occurrences ends on its last one
  and continues the action's head (`settle/2`).

  **Ends (R1).** Those two `until_date`s, a split's old part ending the day
  before and a settled part ending on its last occurrence, only stop the
  top-up: they're marked `internal_end`. The person's "Ends" is the
  **chain's** (`chain_ends/1`): that of the latest-starting series, from the
  acted-on one through its continuations, whose end isn't internal; none is
  "never". The dialog shows it (`info/1`), and a rule change from an earlier
  occurrence starts from it, so leaving Ends alone keeps the chain's real
  end. Given either end param, both are replaced (a blank is none).

  **"After N times" across a split.** N counts from the chain's first
  occurrence: the dates before the edited one in its series and in the
  series parts it continues (`used_before/2`). The new series stores what's
  left as its own count, and `chain_ends/1` adds the earlier parts' dates
  back, so every part shows the person's N (D42 R2). A part stored as a
  date before D42 stays a date.

  **Ends only (D42).** A "following" edit that changes only Ends moves the
  chain's end (`move_end/5`): no part's rule changes, and occurrences are
  added or removed only at the end. `change_preview/2` tells the confirm
  which it is.
  """
  import Ecto.Query, only: [from: 2]

  @content_fields ~w(title notes assignee_id)
  @rule_params %{
    "repeat" => "frequency",
    "repeat_month_rule" => "month_rule",
    "repeat_interval" => "interval",
    "repeat_weekdays" => "weekdays",
    "repeat_day_of_month" => "day_of_month",
    "repeat_week_of_month" => "week_of_month",
    "repeat_weekday" => "weekday",
    "repeat_until" => "until_date",
    "repeat_count" => "count"
  }
  @rule_fields ~w(frequency month_rule interval weekdays day_of_month week_of_month weekday until_date count)a

  alias Ecto.Changeset
  alias RockcutApi.{Tasks, Repo}
  alias RockcutApi.Accounts.{Department, User}
  alias RockcutApi.Tasks.{Event, Task, TaskSeries}
  alias RockcutApi.Scheduling.Recurrence

  @doc "True when `attrs` (string keys) ask for a recurring task."
  def repeat?(attrs), do: Map.get(attrs, "repeat") not in [nil, "", "never"]

  @doc """
  Create a recurring task on `dept`'s board starting on `due_on`, with every
  occurrence through today + 12 months. Logs one `created` event, with the rule, on the first
  occurrence, and returns `{:ok, first_occurrence}`.

  No `due_on` → `{:error, :repeat_needs_day}`. An invalid rule, or one with no
  dates in range → `{:error, changeset}`.
  """
  def create(%Department{} = dept, attrs, %User{} = actor, %Date{} = today) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    if attrs["due_on"] in [nil, ""] do
      {:error, :repeat_needs_day}
    else
      write_transaction(fn ->
        series =
          %TaskSeries{department_id: dept.id, created_by_id: actor.id, skipped_dates: []}
          |> TaskSeries.changeset(series_attrs(attrs))
          |> Tasks.validate_assignee()
          |> Repo.insert()
          |> ok_or_rollback()

        through = Recurrence.rolling_horizon(series, today)

        case series |> TaskSeries.rule() |> Recurrence.dates(through) do
          [] ->
            series
            |> Changeset.change()
            |> Changeset.add_error(:repeat, "the repeat pattern has no dates in range")
            |> Repo.rollback()

          dates ->
            insert_occurrences(series, dates)
            mark_generated(series, through)
            first = first_occurrence(series)

            log!(first, "created", actor, %{
              "due_on" => Date.to_iso8601(first.due_on),
              "assignee_id" => first.assignee_id,
              "repeat" => describe(series)
            })

            first
        end
      end)
    end
  end

  @doc """
  Generate the dates each series is missing up to today + 12 months: one
  query finds the series whose `generated_through` is behind, so a second run
  the same day does nothing. Never fills a skipped date, or goes past
  `until_date` or `count`. Writes no History. Returns `{:ok, added}`.
  """
  def top_up(%Date{} = today) do
    horizon = Date.shift(today, year: 1)

    behind =
      Repo.all(
        from s in TaskSeries,
          where:
            s.generated_through < ^horizon and
              (is_nil(s.until_date) or s.generated_through < s.until_date)
      )

    added =
      Enum.reduce(behind, 0, fn series, added ->
        {:ok, n} = write_transaction(fn -> top_up_one(series.id, today) end)
        added + n
      end)

    {:ok, added}
  end

  # Re-read inside the transaction: the series may have been stopped or
  # topped up since the query.
  defp top_up_one(id, today) do
    with %TaskSeries{generated_through: %Date{} = from} = series <- Repo.get(TaskSeries, id),
         through = Recurrence.rolling_horizon(series, today),
         :gt <- Date.compare(through, from) do
      dates =
        series
        |> TaskSeries.rule()
        |> Recurrence.dates(through)
        |> Enum.filter(&(Date.compare(&1, from) == :gt))

      n = insert_occurrences(series, dates)
      mark_generated(series, through)
      n
    else
      _ -> 0
    end
  end

  @doc """
  Make a one-off task repeat (D39 Decision 6). It becomes the first
  occurrence of a new series starting on its day (or on `attrs["due_on"]`),
  and the later ones are made as on create, through today + 12 months. When
  the rule's first date isn't that day (a weekly rule on other weekdays), the
  task moves to the bottom of the first date, as a new series' first
  occurrence would be there. Title, notes and assignee in `attrs` apply too.

  Logs one `made_repeating` event, with the rule and any content change
  (`from`/`to`); none for the occurrences or the move.

  No day → `{:error, :repeat_needs_day}`; a finished task →
  `{:error, :repeat_finished}`; an invalid rule, or one with no dates in
  range → `{:error, changeset}`.
  """
  def make_repeating(%Task{id: id}, attrs, %User{} = actor, %Date{} = today) do
    write_transaction(fn ->
      task = fetch!(id)
      if task.series_id, do: Repo.rollback(:already_repeats)
      if Task.done?(task), do: Repo.rollback(:repeat_finished)

      content = Task.changeset(task, Map.take(attrs, @content_fields))
      if not content.valid?, do: Repo.rollback(content)

      due_on =
        if Map.has_key?(attrs, "due_on"), do: blank_nil(attrs["due_on"]), else: task.due_on

      if is_nil(due_on), do: Repo.rollback(:repeat_needs_day)

      merged =
        content
        |> Changeset.apply_changes()
        |> Map.take([:title, :notes, :assignee_id])
        |> Map.new(fn {k, v} -> {to_string(k), v} end)
        |> Map.merge(Map.take(attrs, Map.keys(@rule_params)))
        |> Map.put("due_on", due_on)

      series =
        %TaskSeries{department_id: task.department_id, created_by_id: actor.id, skipped_dates: []}
        |> TaskSeries.changeset(series_attrs(merged))
        |> Tasks.validate_assignee()
        |> Repo.insert()
        |> ok_or_rollback()

      through = Recurrence.rolling_horizon(series, today)

      [first | later] =
        case series |> TaskSeries.rule() |> Recurrence.dates(through) do
          [] ->
            series
            |> Changeset.change()
            |> Changeset.add_error(:repeat, "the repeat pattern has no dates in range")
            |> Repo.rollback()

          dates ->
            dates
        end

      position =
        if task.due_on == first,
          do: task.position,
          else: Tasks.next_position(task.department_id, first)

      updated =
        task
        |> Changeset.change(
          series_id: series.id,
          series_date: first,
          series_exception: false,
          title: series.title,
          notes: series.notes,
          assignee_id: series.assignee_id,
          due_on: first,
          position: position
        )
        |> Repo.update!()

      if task.due_on != first, do: Tasks.renumber_days(task.department_id, [task.due_on])
      insert_occurrences(series, later)
      mark_generated(series, through)

      edited =
        Map.new(content.changes, fn {k, v} -> {to_string(k), {Map.get(task, k), v}} end)

      log!(updated, "made_repeating", actor, %{
        "due_on" => Date.to_iso8601(first),
        "repeat" => describe(series),
        "from" => Map.new(edited, fn {k, {from, _}} -> {k, from} end),
        "to" => Map.new(edited, fn {k, {_, to}} -> {k, to} end)
      })

      updated
    end)
  end

  ## Edits

  @doc """
  Edit an occurrence (`attrs` with string keys):

    * `"this"`: the D38 edit, and the occurrence becomes an exception (S60)
      unless only its notes changed (D42). Repeat params are ignored.
    * `"following"`, content only (title, notes, assignee): the series and
      every open, non-exception occurrence from this `series_date` on take
      it, notes only where they were the series' (D42); this occurrence
      takes it even if it's an exception (S61).
    * `"following"` with a changed rule: a split (S62, see `split/5`).
    * A `due_on` change applies to this occurrence only, whatever the scope.
    * No scope: `{:error, :scope_required}`, unless only the day changes.

  `opts`: `changed` (`:keep` | `:remove`) for a split, and `today`.
  """
  def update(task, attrs, scope, actor, opts \\ [])

  def update(%Task{series_id: nil} = task, attrs, _scope, %User{} = actor, _opts),
    do: Tasks.update_one(task, attrs, actor)

  def update(%Task{} = task, attrs, scope, %User{} = actor, opts) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    cond do
      scope == "following" -> update_following(task, attrs, actor, opts)
      scope == "this" or not content_change?(task, attrs) -> update_this(task, attrs, actor)
      true -> {:error, :scope_required}
    end
  end

  defp content_change?(task, attrs) do
    Task.changeset(task, Map.take(attrs, @content_fields)).changes != %{} or
      Enum.any?(Map.keys(@rule_params), &Map.has_key?(attrs, &1))
  end

  defp update_this(task, attrs, actor) do
    write_transaction(fn ->
      task = fetch!(task.id)
      content = Task.changeset(task, Map.take(attrs, @content_fields)).changes

      updated =
        task
        |> Tasks.update_one(Map.take(attrs, ["due_on" | @content_fields]), actor, "this")
        |> ok_or_rollback()

      # D42 §2.5: a notes-only change doesn't make it changed on its own.
      if Map.delete(content, :notes) != %{} and updated.series_id do
        updated |> Changeset.change(series_exception: true) |> Repo.update!()
      else
        updated
      end
    end)
  end

  defp update_following(task, attrs, actor, opts) do
    write_transaction(fn ->
      task = fetch!(task.id)
      series = Repo.get!(TaskSeries, task.series_id)

      case new_rule(series, attrs) do
        :same ->
          following_content(task, series, attrs, actor)

        {:ends, rule} ->
          ends = move_end(task, series, rule, actor, opts)
          following_content(fetch!(task.id), Repo.get!(TaskSeries, series.id), attrs, actor, ends)

        {:changed, rule} ->
          split(task, series, rule, attrs, actor, opts)

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  # The series' rule with the repeat params in `attrs` over it: `:same`,
  # `{:ends, rule_attrs}` when only Ends changed (D42 §2.6),
  # `{:changed, rule_attrs}`, or an error for "never" (that's Stop repeating).
  defp new_rule(series, attrs) do
    base = with_chain_ends(series)
    current = Map.new(@rule_fields, &{to_string(&1), Map.get(base, &1)})
    given = attrs |> Map.take(Map.keys(@rule_params)) |> both_ends()

    overrides =
      given
      |> Map.new(fn {k, v} -> {@rule_params[k], v} end)
      |> parse_rule()

    rule = Map.merge(current, overrides)

    cond do
      Map.get(given, "repeat") in ["never", ""] ->
        {:error,
         %TaskSeries{}
         |> Changeset.change()
         |> Changeset.add_error(:repeat, "to end the repeats, use Stop repeating")}

      given == %{} or same_rule?(base, rule) ->
        :same

      same_rule?(base, Map.merge(rule, %{"until_date" => base.until_date, "count" => base.count})) ->
        {:ends, rule}

      true ->
        {:changed, rule}
    end
  end

  # An end param given replaces both ends: the one left out is none.
  defp both_ends(given) do
    if Map.has_key?(given, "repeat_until") or Map.has_key?(given, "repeat_count"),
      do: Map.merge(%{"repeat_until" => nil, "repeat_count" => nil}, given),
      else: given
  end

  # Compare after the changeset clears the options that don't belong to the
  # rule, so leftovers (weekdays on a monthly rule) don't count as a change.
  defp same_rule?(series, rule) do
    cs = TaskSeries.changeset(series, rule)
    cs.valid? and Map.take(cs.changes, @rule_fields) == %{}
  end

  # Content to this occurrence and the later open, non-exception ones; the day
  # (if it changed) to this one only. D42 §2.5: new notes skip an occurrence
  # whose notes differ from its series' notes before the edit (its own notes
  # stay); title and assignee still reach it.
  # `ends`: an Ends-only change's History detail (`move_end/5`), logged in the
  # same `edited` event (one per series action, Decision 3).
  defp following_content(task, series, attrs, actor, ends \\ nil) do
    content = Map.take(attrs, @content_fields)

    this_cs =
      task
      |> Task.changeset(content)
      |> Tasks.validate_assignee()

    if not this_cs.valid?, do: Repo.rollback(this_cs)

    parts = [series | continuations(series)]

    Enum.each(parts, fn s ->
      s
      |> TaskSeries.changeset(content)
      |> Tasks.validate_assignee()
      |> Repo.update()
      |> ok_or_rollback()
    end)

    changes = Map.take(this_cs.changes, [:title, :notes, :assignee_id])

    if changes != %{} do
      Repo.update!(this_cs)

      later =
        from(t in Task,
          where:
            t.series_id in ^Enum.map(parts, & &1.id) and
              t.series_date >= ^task.series_date and t.id != ^task.id and
              is_nil(t.completed_at) and not t.series_exception
        )

      {notes, others} = Map.split(changes, [:notes])
      others_ids = if others == %{}, do: [], else: Repo.all(from t in later, select: t.id)
      notes_ids = if notes == %{}, do: [], else: same_notes_ids(later, parts)

      set_on(others_ids, others)
      set_on(notes_ids, notes)

      log!(
        task,
        "edited",
        actor,
        %{
          "scope" => "following",
          "from" => Map.new(changes, fn {k, _} -> {to_string(k), Map.get(task, k)} end),
          "to" => Map.new(changes, fn {k, v} -> {to_string(k), v} end),
          "count" => length(Enum.uniq(others_ids ++ notes_ids)) + 1
        }
        |> Map.merge(ends || %{})
      )
    else
      if ends, do: log!(task, "edited", actor, Map.put(ends, "scope", "following"))
    end

    move_this(fetch!(task.id), attrs, actor)
  end

  # The ids in `query` whose notes are their series part's (as loaded, before
  # the edit).
  defp same_notes_ids(query, parts) do
    Enum.flat_map(parts, fn %TaskSeries{id: id, notes: notes} ->
      query = from t in query, where: t.series_id == ^id, select: t.id

      if is_nil(notes),
        do: Repo.all(from t in query, where: is_nil(t.notes)),
        else: Repo.all(from t in query, where: t.notes == ^notes)
    end)
  end

  defp set_on([], _changes), do: :ok

  defp set_on(ids, changes) do
    Repo.update_all(from(t in Task, where: t.id in ^ids),
      set: Keyword.new(changes) ++ [updated_at: now()]
    )
  end

  defp move_this(task, attrs, actor) do
    if Map.has_key?(attrs, "due_on") do
      Tasks.update_one(task, %{"due_on" => attrs["due_on"]}, actor) |> ok_or_rollback()
    else
      task
    end
  end

  # D42 §2.6: an Ends-only change moves the chain's end and changes no part's
  # rule: the open occurrences after the new end are removed (exceptions per
  # `changed`), the parts left with nothing after it settle, and the part the
  # end lands on generates up to it. Returns the History detail.
  defp move_end(task, series, rule, _actor, opts) do
    today = opts[:today] || Tasks.today()
    base = with_chain_ends(series)
    plan = end_plan(task, series, rule) |> ok_or_rollback()
    [first | rest] = plan.chain

    {removed, kept} =
      if plan.cut, do: remove_chain(first, rest, plan.cut, opts[:changed], []), else: {0, 0}

    held = MapSet.new(plan.held, & &1.id)
    settle(Enum.reject(plan.chain, &MapSet.member?(held, &1.id)), plan.target.id)

    target = plan.changeset |> Changeset.change(internal_end: false) |> Repo.update!()
    through = Recurrence.rolling_horizon(target, today)
    added = insert_occurrences(target, target |> TaskSeries.rule() |> Recurrence.dates(through))
    mark_generated(target, through)

    %{
      "repeat" => %{
        "from" => describe(base),
        "to" => describe(%{base | until_date: plan.until, count: plan.count})
      },
      "ends_only" => true,
      "removed" => removed,
      "kept" => kept,
      "added" => added
    }
  end

  # Where an Ends-only change puts the end: `{:ok, plan}` or `{:error, cs}`.
  # The end goes on the latest part of the chain's main line (`line/1`) that
  # it reaches, `target`, as that part's own end: a date, or the count less
  # the dates before the part (R2). `cut` is the first date after the new end
  # (nil for never); `held` the line's parts up to the target, which keep
  # their place; `chain` the acted-on series and its continuations. An end
  # before this occurrence is refused with a split's answers.
  defp end_plan(task, series, rule) do
    whole = TaskSeries.changeset(series, Map.take(rule, ["until_date", "count"]))
    {until, count} = {Changeset.get_field(whole, :until_date), Changeset.get_field(whole, :count)}
    chain = [series | continuations(series)]

    last =
      chain
      |> Enum.reject(& &1.internal_end)
      |> Enum.max_by(& &1.start_date, Date, fn -> series end)

    line = line(last)
    used = used_before(series, task.series_date)

    target =
      cond do
        until -> Enum.filter(line, &(Date.compare(&1.start_date, until) != :gt))
        count -> Enum.filter(line, &(used_before(&1, &1.start_date) < count))
        true -> line
      end
      |> List.last()
      |> Kernel.||(hd(line))

    own = if count, do: count - used_before(target, target.start_date)
    changeset = TaskSeries.changeset(target, %{"until_date" => until, "count" => own})

    cond do
      not whole.valid? ->
        {:error, whole}

      until && Date.compare(until, task.series_date) == :lt ->
        {:error, Changeset.add_error(whole, :until_date, "must be on or after the start date")}

      count && count <= used ->
        {:error,
         Changeset.add_error(
           whole,
           :count,
           "the series already has #{used} dates before this one; choose a larger number"
         )}

      not changeset.valid? ->
        {:error, changeset}

      true ->
        {:ok,
         %{
           chain: chain,
           target: target,
           changeset: changeset,
           until: until,
           count: count,
           cut: cut_after(Changeset.apply_changes(changeset)),
           held: Enum.filter(line, &(Date.compare(&1.start_date, target.start_date) != :gt))
         }}
    end
  end

  # The day after the series' last date (deleted ones count); nil for never.
  defp cut_after(%TaskSeries{until_date: nil, count: nil}), do: nil

  defp cut_after(%TaskSeries{} = s) do
    far = s.until_date || Date.add(s.start_date, 366 * (s.count + 1))

    case %{TaskSeries.rule(s) | skipped_dates: []} |> Recurrence.dates(far) |> List.last() do
      nil -> s.start_date
      last -> Date.add(last, 1)
    end
  end

  # The chain's main line ending in `series`, first part first: each part
  # ends (internally) the day before the next one starts, as `used_before/3`
  # walks it. Parts left holding kept occurrences after a split are off it.
  defp line(%TaskSeries{} = series, acc \\ []) do
    acc = [series | acc]

    parent =
      series.continues_series_id && !Enum.any?(acc, &(&1.id == series.continues_series_id)) &&
        Repo.get(TaskSeries, series.continues_series_id)

    if parent && parent.internal_end && parent.until_date == Date.add(series.start_date, -1),
      do: line(parent, acc),
      else: acc
  end

  # "This and all following" with a new rule (S62), as D32's split: the old
  # series ends the day before this occurrence's `series_date` (or is deleted
  # when this is its first date); its later open occurrences are removed
  # (exceptions per `changed`); a new series starts on this `series_date` with
  # the merged content and rule. A `count` is the whole series' total, so the
  # new part gets what's left after the old one's earlier dates.
  #
  # This occurrence is reused as the new series' first one when the new rule
  # gives its date, so it keeps its id and History. Otherwise the new rule
  # doesn't include its date: if open it's removed with the others (History
  # stays under its id), and the new series' first occurrence is a new task.
  # A finished occurrence is never changed or removed.
  defp split(task, series, rule, attrs, actor, opts) do
    date = task.series_date
    today = opts[:today] || Tasks.today()

    used = used_before(series, date)

    content =
      series
      |> Map.take([:title, :notes, :assignee_id])
      |> Map.new(fn {k, v} -> {to_string(k), v} end)
      |> Map.merge(Map.take(attrs, @content_fields))

    new_attrs =
      content
      |> Map.merge(rule)
      |> Map.merge(%{"start_date" => date})
      |> remaining_count(used)

    new_series =
      %TaskSeries{
        department_id: series.department_id,
        created_by_id: actor.id,
        skipped_dates: []
      }
      |> TaskSeries.changeset(new_attrs)
      |> Tasks.validate_assignee()
      |> Repo.insert()
      |> ok_or_rollback()

    through = Recurrence.rolling_horizon(new_series, today)
    dates = new_series |> TaskSeries.rule() |> Recurrence.dates(through)

    if dates == [] do
      new_series
      |> Changeset.change()
      |> Changeset.add_error(:repeat, "the repeat pattern has no dates in range")
      |> Repo.rollback()
    end

    reuse? = hd(dates) == date and is_nil(task.completed_at)

    # The acted-on occurrence is reused or replaced, never kept as a changed one.
    continuing = continuations(series)
    {removed, kept} = remove_chain(series, continuing, date, opts[:changed], [task.id])

    if reuse? do
      task
      |> Task.changeset(Map.take(attrs, @content_fields))
      |> Changeset.change(
        series_id: new_series.id,
        series_date: date,
        series_exception: task.due_on != date
      )
      |> Repo.update!()
    else
      if is_nil(task.completed_at) do
        Repo.delete!(task)
        Tasks.renumber_days(task.department_id, [task.due_on])
      end
    end

    chain_ids = [series.id | Enum.map(continuing, & &1.id)]
    {new_series, dates} = skip_kept_days(new_series, chain_ids, date, through, dates, reuse?)
    head = series |> end_series_before(date, true) |> head_id(series)

    new_series =
      new_series
      |> Changeset.change(continues_series_id: head)
      |> Repo.update!()

    settle(continuing, new_series.id)
    insert_occurrences(new_series, dates)
    mark_generated(new_series, through)

    first = first_occurrence(new_series)

    log!(
      first,
      "edited",
      actor,
      %{
        "scope" => "following",
        "repeat" => %{"from" => describe(with_chain_ends(series)), "to" => describe(new_series)},
        "removed" => removed,
        "kept" => kept
      }
      |> Map.merge(if reuse?, do: %{}, else: %{"replaced_task_id" => task.id})
    )

    if reuse?, do: move_this(first, attrs, actor), else: first
  end

  # The chain's occurrences that stay from `date` on (kept exceptions and
  # finished ones) already hold their days: the new series skips those days
  # (their current `due_on`), now and in every top-up, so no day shows two.
  defp skip_kept_days(new_series, chain_ids, date, through, dates, reuse?) do
    days =
      Repo.all(
        from t in Task,
          where: t.series_id in ^chain_ids and t.series_date >= ^date and not is_nil(t.due_on),
          select: t.due_on
      )
      |> Enum.uniq()

    if days == [] do
      {new_series, dates}
    else
      new_series =
        new_series |> Changeset.change(skipped_dates: days) |> Repo.update!()

      case new_series |> TaskSeries.rule() |> Recurrence.dates(through) do
        [] when not reuse? ->
          new_series
          |> Changeset.change()
          |> Changeset.add_error(:repeat, "the repeat pattern has no dates in range")
          |> Repo.rollback()

        dates ->
          {new_series, dates}
      end
    end
  end

  defp remaining_count(%{"count" => total} = attrs, used) when is_integer(total) do
    if total > used do
      Map.put(attrs, "count", total - used)
    else
      %TaskSeries{}
      |> Changeset.change()
      |> Changeset.add_error(
        :count,
        "the series already has #{used} dates before this one; choose a larger number"
      )
      |> Repo.rollback()
    end
  end

  defp remaining_count(attrs, _used), do: attrs

  ## Delete and stop

  @doc """
  Delete an occurrence:

    * `"this"`: its `series_date` goes on the series' `skipped_dates` so it's
      never made again, and the task goes through the D38 delete, so History
      has its `deleted` entry (S64).
    * `"following"`: this occurrence and the later open ones, through the
      chain, are removed (exceptions per `opts[:changed]`), and the series
      ends the day before.
      One `deleted` event, on this occurrence, with the counts.
    * No scope: `{:error, :scope_required}`.
  """
  def delete(task, scope, actor, opts \\ [])

  def delete(%Task{series_id: nil} = task, _scope, %User{} = actor, _opts),
    do: Tasks.delete_one(task, actor)

  def delete(%Task{} = task, "this", %User{} = actor, _opts) do
    write_transaction(fn ->
      task = fetch!(task.id)
      skip_date!(task.series_id, task.series_date)
      Tasks.delete_one(task, actor, %{"scope" => "this"}) |> ok_or_rollback()
    end)
  end

  def delete(%Task{} = task, "following", %User{} = actor, opts) do
    write_transaction(fn ->
      task = fetch!(task.id)
      series = Repo.get!(TaskSeries, task.series_id)
      continuing = continuations(series)

      {removed, kept} =
        remove_chain(series, continuing, task.series_date, opts[:changed], [task.id])

      head = series |> end_series_before(task.series_date, false) |> head_id(series)
      # Deleted from its first date: what it continued now ends the task.
      if head && head != series.id, do: real_end!(head)
      settle(continuing, head)

      Tasks.delete_one(task, actor, %{
        "scope" => "following",
        "removed" => removed,
        "kept" => kept
      })
      |> ok_or_rollback()
    end)
  end

  def delete(%Task{}, _scope, _actor, _opts), do: {:error, :scope_required}

  @doc """
  Stop repeating after this occurrence (S63): the series ends on its
  `series_date`, and the later open occurrences, through the chain, are
  removed (exceptions per `opts[:changed]`). One `stopped_repeating` event with the counts. Returns
  `{:ok, task}`.
  """
  def stop(%Task{} = task, %User{} = actor, opts \\ []) do
    write_transaction(fn ->
      task = fetch!(task.id)
      if is_nil(task.series_id), do: Repo.rollback(:not_in_series)
      series = Repo.get!(TaskSeries, task.series_id)
      continuing = continuations(series)

      {removed, kept} =
        remove_chain(series, continuing, Date.add(task.series_date, 1), opts[:changed], [])

      series
      |> Changeset.change(until_date: task.series_date, count: nil, internal_end: false)
      |> Repo.update!()

      settle(continuing, series.id)

      log!(task, "stopped_repeating", actor, %{
        "series_date" => Date.to_iso8601(task.series_date),
        "removed" => removed,
        "kept" => kept
      })

      fetch!(task.id)
    end)
  end

  @doc """
  The open occurrences after this one (by `series_date`) through the chain,
  for the confirm (Decision 2): `later_open` not changed on their own,
  `later_changed` that were.
  """
  def preview(%Task{series_id: nil}), do: %{later_open: 0, later_changed: 0}

  def preview(%Task{series_id: id} = task) do
    ids = [id | chain_ids(id)]

    {open, changed} =
      changed_counts(
        from t in Task,
          where:
            t.series_id in ^ids and t.series_date > ^task.series_date and
              is_nil(t.completed_at)
      )

    %{later_open: open, later_changed: changed}
  end

  # Changed on its own (Decision 2): an exception, or an occurrence with its
  # own notes, different from its series part's (D42; notes alone don't make
  # an exception, but the person's notes are kept like one).
  defp changed?(%Task{} = t, %TaskSeries{} = s), do: t.series_exception or t.notes != s.notes

  # `{plain, changed}` counts of the occurrences `query` finds.
  defp changed_counts(query) do
    Repo.all(
      from t in query,
        join: s in TaskSeries,
        on: s.id == t.series_id,
        select: {t.series_exception, t.notes, s.notes}
    )
    |> Enum.reduce({0, 0}, fn {exception, notes, own}, {plain, changed} ->
      if exception or notes != own, do: {plain, changed + 1}, else: {plain + 1, changed}
    end)
  end

  @doc """
  What a "following" edit with these repeat params (`attrs`, string keys)
  would do, for the confirm (D42 §2.6): `kind` is `"same"` (no rule change),
  `"ends"` (only Ends changed: the end moves) or `"rule"` (a split), with the
  open occurrences it removes, `removes_open` not changed on their own and
  `removes_changed` that were. `{:error, changeset}` for an end it would
  refuse.
  """
  def change_preview(%Task{series_id: nil}, _attrs), do: {:error, :not_in_series}

  def change_preview(%Task{series_id: id} = task, attrs) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    case Repo.get(TaskSeries, id) do
      nil ->
        {:error, :not_in_series}

      series ->
        case new_rule(series, attrs) do
          :same ->
            {:ok, %{kind: "same", removes_open: 0, removes_changed: 0}}

          {:changed, _rule} ->
            %{later_open: open, later_changed: changed} = preview(task)
            {:ok, %{kind: "rule", removes_open: open, removes_changed: changed}}

          {:ends, rule} ->
            with {:ok, plan} <- end_plan(task, series, rule) do
              {open, changed} = open_from(plan.chain, plan.cut)
              {:ok, %{kind: "ends", removes_open: open, removes_changed: changed}}
            end

          {:error, cs} ->
            {:error, cs}
        end
    end
  end

  defp open_from(_chain, nil), do: {0, 0}

  defp open_from(chain, %Date{} = cut) do
    changed_counts(
      from t in Task,
        where:
          t.series_id in ^Enum.map(chain, & &1.id) and t.series_date >= ^cut and
            is_nil(t.completed_at)
    )
  end

  @doc """
  Mark the occurrences that end their chain (G2), for the board: the series
  has ended on or before the occurrence (`until_date`) and nothing open comes
  after it in the chain, so Stop repeating would do nothing. One query for the
  series; the chain is looked at only for the ones that ended.
  """
  def mark_last(tasks) do
    ids = tasks |> Enum.map(& &1.series_id) |> Enum.reject(&is_nil/1) |> Enum.uniq()

    untils =
      Repo.all(
        from s in TaskSeries,
          where: s.id in ^ids and not is_nil(s.until_date),
          select: {s.id, s.until_date}
      )
      |> Map.new()

    Enum.map(tasks, fn t ->
      until = if t.series_id, do: untils[t.series_id]

      if until != nil and Date.compare(until, t.series_date) != :gt and not open_later?(t),
        do: %{t | series_last: true},
        else: t
    end)
  end

  defp open_later?(%Task{series_id: id, series_date: date}) do
    ids = [id | chain_ids(id)]

    Repo.exists?(
      from t in Task,
        where: t.series_id in ^ids and t.series_date > ^date and is_nil(t.completed_at)
    )
  end

  @doc """
  The rule behind an occurrence, with the chain's ends (`chain_ends/1`), and
  its `preview/1` counts:
  `{:ok, {series, preview}}`, or `{:error, :not_in_series}` for a one-off.
  """
  def info(%Task{series_id: nil}), do: {:error, :not_in_series}

  def info(%Task{series_id: id} = task) do
    case Repo.get(TaskSeries, id) do
      nil -> {:error, :not_in_series}
      series -> {:ok, {with_chain_ends(series), preview(task)}}
    end
  end

  @doc false
  # Put `date` on the series' skipped dates (a deleted or detached occurrence).
  def skip_date!(series_id, %Date{} = date) do
    series = Repo.get!(TaskSeries, series_id)
    skipped = Enum.uniq([date | series.skipped_dates || []])
    series |> Changeset.change(skipped_dates: skipped) |> Repo.update!()
  end

  # Remove the open occurrences with `series_date >= from`, except the `except`
  # ids (the acted-on one, handled by the caller); the ones changed on their
  # own (`changed?/2`) are kept unless `changed` is `:remove`. Finished ones stay. Returns `{removed, kept}`.
  defp remove_later(series, from, changed, except) do
    open =
      Repo.all(
        from t in Task,
          where:
            t.series_id == ^series.id and t.series_date >= ^from and is_nil(t.completed_at) and
              t.id not in ^except
      )

    {changed_ones, plain} = Enum.split_with(open, &changed?(&1, series))
    doomed = if changed == :remove, do: open, else: plain
    ids = Enum.map(doomed, & &1.id)

    Repo.delete_all(from t in Task, where: t.id in ^ids)
    Tasks.renumber_days(series.department_id, Enum.map(doomed, & &1.due_on))

    {length(doomed), if(changed == :remove, do: 0, else: length(changed_ones))}
  end

  # The series ends the day before `date`, or is deleted when the rule has no
  # date before it (`date` is its first; the start may be earlier, as a
  # "last Friday" rule started on a Monday). What's left of a deleted one,
  # finished and kept occurrences, become one-offs.
  # `internal?`: a split's old part (the end only stops the top-up), not the
  # person's end (delete "following").
  defp end_series_before(series, date, internal?) do
    before = Recurrence.dates(%{TaskSeries.rule(series) | skipped_dates: []}, Date.add(date, -1))

    if before != [] do
      series
      |> Changeset.change(until_date: Date.add(date, -1), count: nil, internal_end: internal?)
      |> Repo.update!()

      :ended
    else
      Repo.delete!(series)
      :deleted
    end
  end

  # What the survivors continue: the acted-on series, or what it continued
  # when it was deleted.
  defp head_id(:ended, series), do: series.id
  defp head_id(:deleted, series), do: series.continues_series_id

  @doc """
  The ids of every series that continues series `id` (G1), transitively:
  the series split off it by a "following" rule change, and theirs.
  """
  def chain_ids(id), do: %TaskSeries{id: id} |> continuations() |> Enum.map(& &1.id)

  # The continuing series, oldest start first. One query per generation.
  defp continuations(%TaskSeries{id: id}), do: continuations([id], MapSet.new([id]), [])

  defp continuations([], _seen, acc), do: Enum.sort_by(acc, & &1.start_date, Date)

  defp continuations(ids, seen, acc) do
    next =
      Repo.all(from s in TaskSeries, where: s.continues_series_id in ^ids)
      |> Enum.reject(&MapSet.member?(seen, &1.id))

    continuations(
      Enum.map(next, & &1.id),
      Enum.reduce(next, seen, &MapSet.put(&2, &1.id)),
      acc ++ next
    )
  end

  # `remove_later/4` over the acted-on series and its continuations; the
  # counts are the whole chain's.
  defp remove_chain(series, continuing, from, changed, except) do
    Enum.reduce([series | continuing], {0, 0}, fn s, {removed, kept} ->
      {r, k} = remove_later(s, from, changed, except)
      {removed + r, kept + k}
    end)
  end

  # After an action over the chain: a continuing series with nothing left is
  # deleted; one with finished or kept occurrences ends on its last one (so
  # the top-up never fills it again) and continues `head`.
  defp settle(continuing, head) do
    for s <- continuing do
      last = Repo.one(from t in Task, where: t.series_id == ^s.id, select: max(t.series_date))

      if last do
        s
        |> Changeset.change(
          until_date: last,
          count: nil,
          internal_end: true,
          continues_series_id: head
        )
        |> Repo.update!()
      else
        Repo.delete!(s)
      end
    end

    :ok
  end

  @doc """
  The chain's ends as the person set them (R1): `{until_date, count}` of the
  latest-starting series, from `series` through its continuations, whose end
  isn't internal; `{nil, nil}` (never) when there's none. A count is the
  chain's total: that part's own plus the dates of the parts before it (R2).
  """
  def chain_ends(%TaskSeries{} = series) do
    [series | continuations(series)]
    |> Enum.reject(& &1.internal_end)
    |> Enum.max_by(& &1.start_date, Date, fn -> nil end)
    |> case do
      nil -> {nil, nil}
      s -> {s.until_date, s.count && s.count + used_before(s, s.start_date)}
    end
  end

  defp with_chain_ends(series) do
    {until, count} = chain_ends(series)
    %{series | until_date: until, count: count}
  end

  defp real_end!(id) do
    from(s in TaskSeries, where: s.id == ^id) |> Repo.update_all(set: [internal_end: false])
  end

  # The chain's dates before `date`, for "after N times": the series' own
  # (deleted ones count, as in `Recurrence.dates/2`) and those of the split
  # parts it continues, each one ending the day before the next one starts.
  defp used_before(series, date, seen \\ MapSet.new()) do
    own =
      length(Recurrence.dates(%{TaskSeries.rule(series) | skipped_dates: []}, Date.add(date, -1)))

    seen = MapSet.put(seen, series.id)

    parent =
      series.continues_series_id && !MapSet.member?(seen, series.continues_series_id) &&
        Repo.get(TaskSeries, series.continues_series_id)

    if parent && parent.internal_end && parent.until_date == Date.add(series.start_date, -1),
      do: own + used_before(parent, series.start_date, seen),
      else: own
  end

  ## Occurrences

  # Each date's occurrence at the bottom of its day. The bottom positions come
  # from one query over the dates' span. A date already made (a concurrent
  # run) is skipped by the unique index. Returns how many were inserted.
  defp insert_occurrences(_series, []), do: 0

  defp insert_occurrences(%TaskSeries{} = series, dates) do
    {first, last} = Enum.min_max_by(dates, &Date.to_gregorian_days/1)

    bottoms =
      Repo.all(
        from t in Task,
          where:
            t.department_id == ^series.department_id and t.due_on >= ^first and
              t.due_on <= ^last,
          group_by: t.due_on,
          select: {t.due_on, max(t.position)}
      )
      |> Map.new()

    now = DateTime.utc_now() |> DateTime.truncate(:second)

    rows =
      Enum.map(dates, fn date ->
        %{
          department_id: series.department_id,
          series_id: series.id,
          series_date: date,
          series_exception: false,
          title: series.title,
          notes: series.notes,
          assignee_id: series.assignee_id,
          due_on: date,
          position: Map.get(bottoms, date, 0) + 1,
          created_by_id: series.created_by_id,
          inserted_at: now,
          updated_at: now
        }
      end)

    {n, _} =
      Repo.insert_all(Task, rows,
        on_conflict: :nothing,
        conflict_target: [:series_id, :series_date]
      )

    n
  end

  # `generated_through` only moves forward.
  defp mark_generated(%TaskSeries{id: id}, through) do
    Repo.update_all(
      from(s in TaskSeries,
        where: s.id == ^id and (is_nil(s.generated_through) or s.generated_through < ^through)
      ),
      set: [generated_through: through]
    )
  end

  defp first_occurrence(%TaskSeries{id: id}) do
    Repo.one!(from t in Task, where: t.series_id == ^id, order_by: [asc: t.series_date], limit: 1)
  end

  ## Params

  defp series_attrs(attrs) do
    %{
      "title" => attrs["title"],
      "notes" => attrs["notes"],
      "assignee_id" => attrs["assignee_id"],
      "start_date" => attrs["due_on"],
      "frequency" => attrs["repeat"],
      "month_rule" => blank_nil(attrs["repeat_month_rule"]),
      "interval" => int(attrs["repeat_interval"]) || 1,
      "weekdays" => int_list(attrs["repeat_weekdays"]),
      "day_of_month" => int(attrs["repeat_day_of_month"]),
      "week_of_month" => int(attrs["repeat_week_of_month"]),
      "weekday" => int(attrs["repeat_weekday"]),
      "until_date" => blank_nil(attrs["repeat_until"]),
      "count" => int(attrs["repeat_count"])
    }
  end

  @doc "The rule as History stores it (string keys, only the rule's own options)."
  def describe(%TaskSeries{} = s) do
    %{
      "frequency" => s.frequency,
      "month_rule" => s.month_rule,
      "interval" => s.interval,
      "weekdays" => s.weekdays,
      "day_of_month" => s.day_of_month,
      "week_of_month" => s.week_of_month,
      "weekday" => s.weekday,
      "until" => s.until_date && Date.to_iso8601(s.until_date),
      "count" => s.count
    }
    |> Map.reject(fn {_k, v} -> is_nil(v) end)
  end

  ## Helpers

  # Read-then-write: start as a write transaction (SQLite BEGIN IMMEDIATE), as
  # D32's series do, so a concurrent writer waits instead of failing.
  defp write_transaction(fun), do: Repo.transaction(fun, mode: :immediate)

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

  defp fetch!(id), do: Repo.get(Task, id) || Repo.rollback(:not_found)

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp parse_rule(rule) do
    rule
    |> Map.new(fn
      {k, v} when k in ~w(interval day_of_month week_of_month weekday count) -> {k, int(v)}
      {"weekdays", v} -> {"weekdays", int_list(v)}
      {k, v} -> {k, blank_nil(v)}
    end)
  end

  defp ok_or_rollback({:ok, value}), do: value
  defp ok_or_rollback({:error, reason}), do: Repo.rollback(reason)

  defp blank_nil(""), do: nil
  defp blank_nil(v), do: v

  defp int(nil), do: nil
  defp int(""), do: nil
  defp int(v) when is_integer(v), do: v

  defp int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, ""} -> n
      _ -> v
    end
  end

  defp int(v), do: v

  defp int_list(nil), do: nil
  defp int_list(list) when is_list(list), do: Enum.map(list, &int/1)

  defp int_list(csv) when is_binary(csv),
    do: csv |> String.split(",", trim: true) |> Enum.map(&String.trim/1) |> int_list()

  defp int_list(v), do: v
end
