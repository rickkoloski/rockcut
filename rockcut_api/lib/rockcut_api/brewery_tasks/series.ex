defmodule RockcutApi.BreweryTasks.Series do
  @moduledoc """
  Recurring Brewery tasks (D39, spec §3.10), used through
  `RockcutApi.BreweryTasks`. Follows D32's `Scheduling.EventSeries`: a
  `TaskSeries` rule row plus a real `Task` per date.

  Occurrences are always kept through `Recurrence.rolling_horizon/2` (today
  plus 12 months, inclusive): `create/3` generates them, and `top_up/1`, run
  by the D22 scanner, adds the new dates each day. Each one goes at the bottom
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
  `stop/3`) keeps the ones changed on their own (`series_exception`) unless
  `changed: :remove` (Decision 2). A day change always applies to one
  occurrence and makes it an exception; onto the Future list it makes it a
  one-off (`BreweryTasks` moves). One History event per series action
  (Decision 3).
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
  alias RockcutApi.{BreweryTasks, Repo}
  alias RockcutApi.Accounts.User
  alias RockcutApi.BreweryTasks.{Event, Task, TaskSeries}
  alias RockcutApi.Scheduling.Recurrence

  @doc "True when `attrs` (string keys) ask for a recurring task."
  def repeat?(attrs), do: Map.get(attrs, "repeat") not in [nil, "", "never"]

  @doc """
  Create a recurring task starting on `due_on`, with every occurrence through
  today + 12 months. Logs one `created` event, with the rule, on the first
  occurrence, and returns `{:ok, first_occurrence}`.

  No `due_on` → `{:error, :repeat_needs_day}`. An invalid rule, or one with no
  dates in range → `{:error, changeset}`.
  """
  def create(attrs, %User{} = actor, %Date{} = today) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    if attrs["due_on"] in [nil, ""] do
      {:error, :repeat_needs_day}
    else
      write_transaction(fn ->
        dept = BreweryTasks.department!()

        series =
          %TaskSeries{department_id: dept.id, created_by_id: actor.id, skipped_dates: []}
          |> TaskSeries.changeset(series_attrs(attrs))
          |> BreweryTasks.validate_assignee()
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

  ## Edits

  @doc """
  Edit an occurrence (`attrs` with string keys):

    * `"this"`: the D38 edit, and the occurrence becomes an exception (S60).
      Repeat params are ignored.
    * `"following"`, content only (title, notes, assignee): the series and
      every open, non-exception occurrence from this `series_date` on take
      it; this occurrence takes it even if it's an exception (S61).
    * `"following"` with a changed rule: a split (S62, see `split/5`).
    * A `due_on` change applies to this occurrence only, whatever the scope.
    * No scope: `{:error, :scope_required}`, unless only the day changes.

  `opts`: `changed` (`:keep` | `:remove`) for a split, and `today`.
  """
  def update(task, attrs, scope, actor, opts \\ [])

  def update(%Task{series_id: nil} = task, attrs, _scope, %User{} = actor, _opts),
    do: BreweryTasks.update_one(task, attrs, actor)

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
        |> BreweryTasks.update_one(Map.take(attrs, ["due_on" | @content_fields]), actor, "this")
        |> ok_or_rollback()

      if content != %{} and updated.series_id do
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
        :same -> following_content(task, series, attrs, actor)
        {:changed, rule} -> split(task, series, rule, attrs, actor, opts)
        {:error, cs} -> Repo.rollback(cs)
      end
    end)
  end

  # The series' rule with the repeat params in `attrs` over it: `:same`,
  # `{:changed, rule_attrs}`, or an error for "never" (that's Stop repeating).
  defp new_rule(series, attrs) do
    current = Map.new(@rule_fields, &{to_string(&1), Map.get(series, &1)})
    given = Map.take(attrs, Map.keys(@rule_params))

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

      given == %{} or same_rule?(series, rule) ->
        :same

      true ->
        {:changed, rule}
    end
  end

  # Compare after the changeset clears the options that don't belong to the
  # rule, so leftovers (weekdays on a monthly rule) don't count as a change.
  defp same_rule?(series, rule) do
    cs = TaskSeries.changeset(series, rule)
    cs.valid? and Map.take(cs.changes, @rule_fields) == %{}
  end

  # Content to this occurrence and the later open, non-exception ones; the day
  # (if it changed) to this one only.
  defp following_content(task, series, attrs, actor) do
    content = Map.take(attrs, @content_fields)

    this_cs =
      task
      |> Task.changeset(content)
      |> BreweryTasks.validate_assignee()

    if not this_cs.valid?, do: Repo.rollback(this_cs)

    series =
      series
      |> TaskSeries.changeset(content)
      |> BreweryTasks.validate_assignee()
      |> Repo.update()
      |> ok_or_rollback()

    changes = Map.take(this_cs.changes, [:title, :notes, :assignee_id])

    if changes != %{} do
      Repo.update!(this_cs)

      {n, _} =
        Repo.update_all(
          from(t in Task,
            where:
              t.series_id == ^series.id and t.series_date >= ^task.series_date and
                t.id != ^task.id and is_nil(t.completed_at) and not t.series_exception
          ),
          set: Keyword.new(changes) ++ [updated_at: now()]
        )

      log!(task, "edited", actor, %{
        "scope" => "following",
        "from" => Map.new(changes, fn {k, _} -> {to_string(k), Map.get(task, k)} end),
        "to" => Map.new(changes, fn {k, v} -> {to_string(k), v} end),
        "count" => n + 1
      })
    end

    move_this(fetch!(task.id), attrs, actor)
  end

  defp move_this(task, attrs, actor) do
    if Map.has_key?(attrs, "due_on") do
      BreweryTasks.update_one(task, %{"due_on" => attrs["due_on"]}, actor) |> ok_or_rollback()
    else
      task
    end
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
    today = opts[:today] || BreweryTasks.today()

    used =
      length(Recurrence.dates(%{TaskSeries.rule(series) | skipped_dates: []}, Date.add(date, -1)))

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
      |> BreweryTasks.validate_assignee()
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
    {removed, kept} = remove_later(series, date, opts[:changed], [task.id])

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
        BreweryTasks.renumber_days(task.department_id, [task.due_on])
      end
    end

    {new_series, dates} = skip_kept_days(new_series, series, date, through, dates, reuse?)
    end_series_before(series, date)
    insert_occurrences(new_series, dates)
    mark_generated(new_series, through)

    first = first_occurrence(new_series)

    log!(
      first,
      "edited",
      actor,
      %{
        "scope" => "following",
        "repeat" => %{"from" => describe(series), "to" => describe(new_series)},
        "removed" => removed,
        "kept" => kept
      }
      |> Map.merge(if reuse?, do: %{}, else: %{"replaced_task_id" => task.id})
    )

    if reuse?, do: move_this(first, attrs, actor), else: first
  end

  # The old series' occurrences that stay from `date` on (kept exceptions and
  # finished ones) already hold their days: the new series skips those days
  # (their current `due_on`), now and in every top-up, so no day shows two.
  defp skip_kept_days(new_series, old_series, date, through, dates, reuse?) do
    days =
      Repo.all(
        from t in Task,
          where:
            t.series_id == ^old_series.id and t.series_date >= ^date and not is_nil(t.due_on),
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
    * `"following"`: this occurrence and the later open ones are removed
      (exceptions per `opts[:changed]`), and the series ends the day before.
      One `deleted` event, on this occurrence, with the counts.
    * No scope: `{:error, :scope_required}`.
  """
  def delete(task, scope, actor, opts \\ [])

  def delete(%Task{series_id: nil} = task, _scope, %User{} = actor, _opts),
    do: BreweryTasks.delete_one(task, actor)

  def delete(%Task{} = task, "this", %User{} = actor, _opts) do
    write_transaction(fn ->
      task = fetch!(task.id)
      skip_date!(task.series_id, task.series_date)
      BreweryTasks.delete_one(task, actor, %{"scope" => "this"}) |> ok_or_rollback()
    end)
  end

  def delete(%Task{} = task, "following", %User{} = actor, opts) do
    write_transaction(fn ->
      task = fetch!(task.id)
      series = Repo.get!(TaskSeries, task.series_id)
      {removed, kept} = remove_later(series, task.series_date, opts[:changed], [task.id])
      end_series_before(series, task.series_date)

      BreweryTasks.delete_one(task, actor, %{
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
  `series_date`, and the later open occurrences are removed (exceptions per
  `opts[:changed]`). One `stopped_repeating` event with the counts. Returns
  `{:ok, task}`.
  """
  def stop(%Task{} = task, %User{} = actor, opts \\ []) do
    write_transaction(fn ->
      task = fetch!(task.id)
      if is_nil(task.series_id), do: Repo.rollback(:not_in_series)
      series = Repo.get!(TaskSeries, task.series_id)

      {removed, kept} =
        remove_later(series, Date.add(task.series_date, 1), opts[:changed], [])

      series |> Changeset.change(until_date: task.series_date, count: nil) |> Repo.update!()

      log!(task, "stopped_repeating", actor, %{
        "series_date" => Date.to_iso8601(task.series_date),
        "removed" => removed,
        "kept" => kept
      })

      fetch!(task.id)
    end)
  end

  @doc """
  The open occurrences after this one (by `series_date`), for the confirm
  (Decision 2): `later_open` not changed on their own, `later_changed` that
  were.
  """
  def preview(%Task{series_id: nil}), do: %{later_open: 0, later_changed: 0}

  def preview(%Task{} = task) do
    counts =
      Repo.all(
        from t in Task,
          where:
            t.series_id == ^task.series_id and t.series_date > ^task.series_date and
              is_nil(t.completed_at),
          group_by: t.series_exception,
          select: {t.series_exception, count(t.id)}
      )
      |> Map.new()

    %{later_open: Map.get(counts, false, 0), later_changed: Map.get(counts, true, 0)}
  end

  @doc """
  The rule behind an occurrence and its `preview/1` counts:
  `{:ok, {series, preview}}`, or `{:error, :not_in_series}` for a one-off.
  """
  def info(%Task{series_id: nil}), do: {:error, :not_in_series}

  def info(%Task{series_id: id} = task) do
    case Repo.get(TaskSeries, id) do
      nil -> {:error, :not_in_series}
      series -> {:ok, {series, preview(task)}}
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
  # ids (the acted-on one, handled by the caller); exceptions are kept unless
  # `changed` is `:remove`. Finished ones stay. Returns `{removed, kept}`.
  defp remove_later(series, from, changed, except) do
    open =
      Repo.all(
        from t in Task,
          where:
            t.series_id == ^series.id and t.series_date >= ^from and is_nil(t.completed_at) and
              t.id not in ^except
      )

    {changed_ones, plain} = Enum.split_with(open, & &1.series_exception)
    doomed = if changed == :remove, do: open, else: plain
    ids = Enum.map(doomed, & &1.id)

    Repo.delete_all(from t in Task, where: t.id in ^ids)
    BreweryTasks.renumber_days(series.department_id, Enum.map(doomed, & &1.due_on))

    {length(doomed), if(changed == :remove, do: 0, else: length(changed_ones))}
  end

  # The series ends the day before `date`, or is deleted when the rule has no
  # date before it (`date` is its first; the start may be earlier, as a
  # "last Friday" rule started on a Monday). What's left of a deleted one,
  # finished and kept occurrences, become one-offs.
  defp end_series_before(series, date) do
    before = Recurrence.dates(%{TaskSeries.rule(series) | skipped_dates: []}, Date.add(date, -1))

    if before != [] do
      series |> Changeset.change(until_date: Date.add(date, -1), count: nil) |> Repo.update!()
    else
      Repo.delete!(series)
    end
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
      task_id: task.id,
      action: action,
      actor_id: actor.id,
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
