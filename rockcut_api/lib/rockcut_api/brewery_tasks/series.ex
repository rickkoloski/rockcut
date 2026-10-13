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
  """
  import Ecto.Query, only: [from: 2]

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

  @doc """
  Delete one occurrence (`"this"`): its `series_date` goes on the series'
  `skipped_dates` so it's never made again, and the task goes through the D38
  delete, so History has its `deleted` entry (S64).
  """
  def delete(%Task{series_id: nil} = task, _scope, %User{} = actor),
    do: BreweryTasks.delete(task, actor)

  def delete(%Task{} = task, "this", %User{} = actor) do
    write_transaction(fn ->
      series = Repo.get!(TaskSeries, task.series_id)
      skipped = Enum.uniq([task.series_date | series.skipped_dates || []])
      series |> Changeset.change(skipped_dates: skipped) |> Repo.update!()
      BreweryTasks.delete(task, actor) |> ok_or_rollback()
    end)
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
