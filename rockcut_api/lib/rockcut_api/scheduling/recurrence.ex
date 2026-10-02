defmodule RockcutApi.Scheduling.Recurrence do
  @moduledoc """
  Pure date rules for repeating schedule events (D32). Everything is computed
  in the business zone, so an occurrence keeps its Colorado wall-clock time
  across daylight-saving changes (7 pm trivia stays 7 pm in November).
  """
  alias RockcutApi.Scheduling.ScheduleEventSeries

  @zone "America/Denver"

  @doc "The business time zone (matches `rockcut-ui/src/lib/datetime.ts`)."
  def zone, do: @zone

  @doc """
  The last date a series may be generated through when it's created: 12 months
  after its start (exclusive), or its end date if that's sooner.
  """
  def initial_horizon(%ScheduleEventSeries{} = s),
    do: cap_until(s, Date.add(Date.shift(s.start_date, year: 1), -1))

  @doc "How far `extend` may generate: 12 months from `today`, or the series' end date."
  def extend_horizon(%ScheduleEventSeries{} = s, %Date{} = today),
    do: cap_until(s, Date.add(Date.shift(today, year: 1), -1))

  defp cap_until(%{until_date: nil}, date), do: date
  defp cap_until(%{until_date: until}, date), do: Enum.min([until, date], Date)

  @doc """
  The occurrence dates of `series` from its start through `through`, honoring
  its end date and count. Skipped (deleted) dates still count toward `count`
  but are not returned.
  """
  def dates(%ScheduleEventSeries{} = s, %Date{} = through) do
    last = cap_until(s, through)

    if Date.compare(last, s.start_date) == :lt do
      []
    else
      s
      |> candidates(last)
      |> maybe_take(s.count)
      |> Enum.reject(&(&1 in (s.skipped_dates || [])))
    end
  end

  defp maybe_take(dates, nil), do: dates
  defp maybe_take(dates, count), do: Enum.take(dates, count)

  defp candidates(%{frequency: "weekly"} = s, last) do
    anchor = monday(s.start_date)

    s.start_date
    |> Date.range(last)
    |> Enum.filter(fn d ->
      Date.day_of_week(d) in s.weekdays and
        rem(div(Date.diff(monday(d), anchor), 7), s.interval) == 0
    end)
  end

  defp candidates(%{frequency: "monthly_weekday"} = s, last) do
    {s.start_date.year, s.start_date.month}
    |> Stream.iterate(fn
      {y, 12} -> {y + 1, 1}
      {y, m} -> {y, m + 1}
    end)
    |> Stream.map(fn {y, m} -> nth_weekday(y, m, s.week_of_month, s.weekday) end)
    |> Stream.take_while(&(Date.compare(&1, last) != :gt))
    |> Enum.filter(&(Date.compare(&1, s.start_date) != :lt))
  end

  @doc "The `n`th (1–4) or last (`-1`) ISO `weekday` of a month."
  def nth_weekday(year, month, -1, weekday) do
    last = Date.end_of_month(Date.new!(year, month, 1))
    Date.add(last, -rem(Date.day_of_week(last) - weekday + 7, 7))
  end

  def nth_weekday(year, month, n, weekday) do
    first = Date.new!(year, month, 1)
    offset = rem(weekday - Date.day_of_week(first) + 7, 7)
    Date.add(first, offset + (n - 1) * 7)
  end

  defp monday(date), do: Date.add(date, 1 - Date.day_of_week(date))

  @doc """
  UTC `{starts_at, ends_at}` for the occurrence on `date`. Timed: the series'
  wall-clock start plus its duration. All day: local midnight to local midnight
  after `span_days`.
  """
  def occurrence_times(%ScheduleEventSeries{all_day: true} = s, %Date{} = date) do
    {local_to_utc(date, ~T[00:00:00]), local_to_utc(Date.add(date, s.span_days), ~T[00:00:00])}
  end

  def occurrence_times(%ScheduleEventSeries{} = s, %Date{} = date) do
    starts = local_to_utc(date, s.start_time)
    {starts, DateTime.add(starts, s.duration_minutes * 60)}
  end

  @doc """
  A Colorado wall-clock date and time as a UTC `DateTime`. A time skipped by
  the spring-forward gap moves to just after it; a repeated fall-back time uses
  the first one.
  """
  def local_to_utc(%Date{} = date, %Time{} = time) do
    local =
      case DateTime.new(date, Time.truncate(time, :second), @zone) do
        {:ok, dt} -> dt
        {:gap, _before, just_after} -> just_after
        {:ambiguous, first, _second} -> first
      end

    local |> DateTime.shift_zone!("Etc/UTC") |> DateTime.truncate(:second)
  end

  @doc "The Colorado date and wall-clock time of a UTC `DateTime`."
  def to_local(%DateTime{} = utc) do
    local = DateTime.shift_zone!(utc, @zone)
    {DateTime.to_date(local), DateTime.to_time(local) |> Time.truncate(:second)}
  end
end
