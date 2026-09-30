defmodule RockcutApi.Scheduling.EventSeries do
  @moduledoc """
  Repeating schedule events (D32 §3.7), used through `RockcutApi.Scheduling`.

  A series is a rule row plus real `ScheduleEvent` rows, one per date, created
  as drafts and published week by week. Edits and deletes apply to one
  occurrence (`"this"`) or to it and every later one (`"following"`). Changing
  the rule with `"following"` ends the old series the day before and starts a
  new one. Never notifies anyone.

  Repeat params are flat: `repeat` (`weekly` | `monthly_weekday`),
  `repeat_interval`, `repeat_weekdays`, `repeat_week_of_month`,
  `repeat_weekday`, `repeat_until` (a date) or `repeat_count`.
  """
  import Ecto.Query
  alias Ecto.Changeset
  alias RockcutApi.Repo
  alias RockcutApi.Scheduling.{Recurrence, ScheduleEvent, ScheduleEventSeries}

  @content_fields ~w(title notes department_id)
  @timing_fields ~w(starts_at ends_at all_day)

  @frequencies ["weekly", "monthly_weekday"]

  @doc "True when `attrs` ask for a repeating event."
  def repeat?(attrs), do: Map.get(attrs, "repeat") in @frequencies

  @doc "An error changeset when `repeat` is set to something that isn't a known pattern."
  def invalid_repeat(attrs) do
    case Map.get(attrs, "repeat") do
      r when r in [nil, "", "none"] or r in @frequencies ->
        nil

      _ ->
        %ScheduleEvent{}
        |> Changeset.change()
        |> Changeset.add_error(:repeat, "must be weekly or monthly_weekday")
    end
  end

  @doc """
  Create a series from event-shaped attrs (the first occurrence's times) plus
  repeat params. Returns `{:ok, first_event, count}`.
  """
  def create(attrs, created_by_id) do
    write_transaction(fn ->
      case insert_series(attrs, created_by_id) do
        {:ok, _series, [first | _] = events} -> {first, length(events)}
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
    |> case do
      {:ok, {first, count}} -> {:ok, first, count}
      error -> error
    end
  end

  @doc "Update one occurrence (`\"this\"`) or it and all later ones (`\"following\"`)."
  def update(%ScheduleEvent{series_id: nil} = event, attrs, _scope), do: update_one(event, attrs)

  def update(%ScheduleEvent{} = event, attrs, "following") do
    cond do
      repeat?(attrs) -> split(event, attrs)
      moves_day?(event, attrs) -> {:error, day_move_error(event, attrs)}
      true -> update_following(event, attrs)
    end
  end

  def update(%ScheduleEvent{} = event, attrs, _this) do
    update_one(event, Map.put(attrs, "series_exception", true))
  end

  @doc "Delete one occurrence, or it and all later ones (ending the series there)."
  def delete(%ScheduleEvent{series_id: nil} = event, _scope), do: Repo.delete(event)

  def delete(%ScheduleEvent{} = event, "following") do
    write_transaction(fn ->
      series = Repo.get!(ScheduleEventSeries, event.series_id)
      end_series_before(series, event)
      event
    end)
  end

  def delete(%ScheduleEvent{} = event, _this) do
    write_transaction(fn ->
      series = Repo.get!(ScheduleEventSeries, event.series_id)
      {date, _} = Recurrence.to_local(event.starts_at)
      skipped = Enum.uniq([date | series.skipped_dates || []])
      series |> Changeset.change(skipped_dates: skipped) |> Repo.update!()
      Repo.delete!(event)
    end)
  end

  @doc """
  Generate more draft occurrences, up to 12 months from `today` or the series'
  end. Idempotent. Returns `{:ok, added_count}`.
  """
  def extend(%ScheduleEventSeries{} = series, %Date{} = today) do
    through = Recurrence.extend_horizon(series, today)
    from = series.generated_through

    if from && Date.compare(through, from) != :gt do
      {:ok, 0}
    else
      write_transaction(fn ->
        dates =
          series
          |> Recurrence.dates(through)
          |> Enum.filter(&(is_nil(from) or Date.compare(&1, from) == :gt))

        Enum.each(dates, &insert_occurrence(series, &1, "draft"))
        series |> Changeset.change(generated_through: through) |> Repo.update!()
        length(dates)
      end)
    end
  end

  ## Create / split

  defp insert_series(attrs, created_by_id) do
    base = ScheduleEvent.changeset(%ScheduleEvent{}, Map.put(attrs, "status", "draft"))

    with {:ok, base_event} <- Changeset.apply_action(base, :insert),
         {:ok, series} <-
           %ScheduleEventSeries{}
           |> ScheduleEventSeries.changeset(series_attrs(base_event, attrs, created_by_id))
           |> Repo.insert() do
      through = Recurrence.initial_horizon(series)

      case Recurrence.dates(series, through) do
        [] ->
          {:error,
           series
           |> Changeset.change()
           |> Changeset.add_error(:repeat, "the repeat pattern has no dates in range")}

        dates ->
          events = Enum.map(dates, &insert_occurrence(series, &1, "draft"))
          series |> Changeset.change(generated_through: through) |> Repo.update!()
          {:ok, series, events}
      end
    end
  end

  # The rule changes from this date on: the old series ends the day before, and
  # a new series (drafts) starts here with the merged content and new rule.
  #
  # A count is the whole series' total (it's what the dialog shows), so the new
  # part gets what's left after the dates before the split.
  defp split(event, attrs) do
    write_transaction(fn ->
      series = Repo.get!(ScheduleEventSeries, event.series_id)
      {date, _} = Recurrence.to_local(event.starts_at)
      used = length(Recurrence.dates(%{series | skipped_dates: []}, Date.add(date, -1)))

      merged =
        event
        |> Map.take([:title, :notes, :department_id, :all_day, :starts_at, :ends_at])
        |> Map.new(fn {k, v} -> {to_string(k), v} end)
        |> Map.merge(attrs)
        |> remaining_count(used)

      with {:ok, merged} <- merged,
           _ <- end_series_before(series, event),
           {:ok, _new, [first | _]} <- insert_series(merged, series.created_by_id) do
        first
      else
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
  end

  defp remaining_count(attrs, used) do
    case int(attrs["repeat_count"]) do
      nil ->
        {:ok, attrs}

      total when total > used ->
        {:ok, Map.put(attrs, "repeat_count", total - used)}

      _ ->
        {:error,
         %ScheduleEvent{}
         |> Changeset.change()
         |> Changeset.add_error(
           :repeat_count,
           "the series already has #{used} dates before this one; choose a larger number"
         )}
    end
  end

  defp end_series_before(series, event) do
    {date, _} = Recurrence.to_local(event.starts_at)

    from(e in ScheduleEvent,
      where: e.series_id == ^series.id and e.starts_at >= ^event.starts_at
    )
    |> Repo.delete_all()

    if Date.compare(date, series.start_date) == :gt do
      series
      |> Changeset.change(until_date: Date.add(date, -1), count: nil)
      |> Repo.update!()
    else
      Repo.delete!(series)
    end
  end

  ## Update

  # A "following" edit keeps each date and changes content or time. Moving this
  # date to another day needs a new repeat rule (the UI sends one); without it
  # the move can't apply to later dates, so refuse instead of ignoring it.
  defp moves_day?(event, attrs) do
    case Changeset.apply_action(ScheduleEvent.changeset(event, attrs), :update) do
      {:ok, edited} ->
        elem(Recurrence.to_local(edited.starts_at), 0) !=
          elem(Recurrence.to_local(event.starts_at), 0)

      _ ->
        false
    end
  end

  defp day_move_error(event, attrs) do
    event
    |> ScheduleEvent.changeset(attrs)
    |> Changeset.add_error(
      :starts_at,
      "to move this and later dates to another day, change the repeat days"
    )
  end

  defp update_one(event, attrs) do
    event |> ScheduleEvent.changeset(attrs) |> Repo.update()
  end

  # Content and time changes apply to this occurrence and every later one,
  # overwriting ones changed individually. Each keeps its own status and date.
  defp update_following(event, attrs) do
    write_transaction(fn ->
      series = Repo.get!(ScheduleEventSeries, event.series_id)
      probe = ScheduleEvent.changeset(event, attrs)

      with {:ok, edited} <- Changeset.apply_action(probe, :update),
           {:ok, series} <-
             series
             |> ScheduleEventSeries.changeset(
               Map.merge(
                 Map.take(attrs, @content_fields),
                 edited
                 |> timing_attrs(Map.take(attrs, @timing_fields) != %{}, series)
                 |> Map.new(fn {k, v} -> {to_string(k), v} end)
               )
             )
             |> Repo.update() do
        from(e in ScheduleEvent,
          where: e.series_id == ^series.id and e.starts_at >= ^event.starts_at
        )
        |> Repo.all()
        |> Enum.each(fn occ ->
          {date, _} = Recurrence.to_local(occ.starts_at)
          {starts_at, ends_at} = Recurrence.occurrence_times(series, date)

          occ
          |> Changeset.change(
            title: series.title,
            notes: series.notes,
            department_id: series.department_id,
            all_day: series.all_day,
            starts_at: starts_at,
            ends_at: ends_at,
            series_exception: false
          )
          |> Repo.update!()
        end)

        Repo.get!(ScheduleEvent, event.id)
      else
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
  end

  ## Helpers

  # These transactions read and then write. Starting them as write transactions
  # (SQLite BEGIN IMMEDIATE) makes a concurrent writer wait for the busy timeout
  # instead of failing the read-to-write upgrade with "Database busy".
  defp write_transaction(fun), do: Repo.transaction(fun, mode: :immediate)

  defp series_attrs(%ScheduleEvent{} = e, attrs, created_by_id) do
    %{
      department_id: e.department_id,
      created_by_id: created_by_id,
      title: e.title,
      notes: e.notes,
      frequency: attrs["repeat"],
      interval: int(attrs["repeat_interval"]) || 1,
      weekdays: int_list(attrs["repeat_weekdays"]),
      week_of_month: int(attrs["repeat_week_of_month"]),
      weekday: int(attrs["repeat_weekday"]),
      until_date: attrs["repeat_until"],
      count: int(attrs["repeat_count"]),
      skipped_dates: []
    }
    |> Map.merge(timing_attrs(e, true, nil))
  end

  # The series' start date, all-day flag and wall-clock timing, from one
  # occurrence's UTC times. Unchanged timing keeps the series' own values.
  defp timing_attrs(_event, false, _series), do: %{}

  defp timing_attrs(%ScheduleEvent{} = e, true, _series) do
    {start_date, start_time} = Recurrence.to_local(e.starts_at)

    if e.all_day do
      {end_date, _} = Recurrence.to_local(e.ends_at)

      %{
        start_date: start_date,
        all_day: true,
        start_time: nil,
        duration_minutes: nil,
        span_days: max(Date.diff(end_date, start_date), 1)
      }
    else
      %{
        start_date: start_date,
        all_day: false,
        start_time: start_time,
        duration_minutes: div(DateTime.diff(e.ends_at, e.starts_at), 60),
        span_days: nil
      }
    end
    |> then(fn t -> if e.id, do: Map.delete(t, :start_date), else: t end)
  end

  defp insert_occurrence(series, date, status) do
    {starts_at, ends_at} = Recurrence.occurrence_times(series, date)

    Repo.insert!(%ScheduleEvent{
      department_id: series.department_id,
      created_by_id: series.created_by_id,
      series_id: series.id,
      title: series.title,
      notes: series.notes,
      all_day: series.all_day,
      starts_at: starts_at,
      ends_at: ends_at,
      status: status
    })
  end

  defp int(nil), do: nil
  defp int(""), do: nil
  defp int(v) when is_integer(v), do: v

  defp int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, ""} -> n
      _ -> nil
    end
  end

  defp int_list(nil), do: nil
  defp int_list(list) when is_list(list), do: list |> Enum.map(&int/1) |> Enum.reject(&is_nil/1)

  defp int_list(csv) when is_binary(csv),
    do: csv |> String.split(",", trim: true) |> Enum.map(&String.trim/1) |> int_list()
end
