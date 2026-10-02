defmodule RockcutApi.Scheduling.RecurrenceTest do
  use ExUnit.Case, async: true

  alias RockcutApi.Scheduling.{Recurrence, ScheduleEventSeries}

  defp weekly(days, opts \\ []) do
    struct(
      ScheduleEventSeries,
      Keyword.merge(
        [
          frequency: "weekly",
          interval: 1,
          weekdays: days,
          start_date: ~D[2026-10-05],
          all_day: false,
          start_time: ~T[19:00:00],
          duration_minutes: 120,
          skipped_dates: []
        ],
        opts
      )
    )
  end

  defp monthly(n, weekday, opts \\ []) do
    struct(
      ScheduleEventSeries,
      Keyword.merge(
        [
          frequency: "monthly_weekday",
          interval: 1,
          week_of_month: n,
          weekday: weekday,
          start_date: ~D[2026-10-01],
          all_day: false,
          start_time: ~T[19:00:00],
          duration_minutes: 120,
          skipped_dates: []
        ],
        opts
      )
    )
  end

  describe "weekly" do
    test "every Tuesday" do
      assert Recurrence.dates(weekly([2]), ~D[2026-10-31]) ==
               [~D[2026-10-06], ~D[2026-10-13], ~D[2026-10-20], ~D[2026-10-27]]
    end

    test "every other week on Tuesday and Thursday, anchored on the start week" do
      assert Recurrence.dates(weekly([2, 4], interval: 2), ~D[2026-10-31]) ==
               [~D[2026-10-06], ~D[2026-10-08], ~D[2026-10-20], ~D[2026-10-22]]
    end

    test "a start mid-week skips weekdays before it" do
      assert Recurrence.dates(weekly([1, 5], start_date: ~D[2026-10-07]), ~D[2026-10-13]) ==
               [~D[2026-10-09], ~D[2026-10-12]]
    end
  end

  describe "monthly by weekday" do
    test "third Sunday" do
      assert Recurrence.dates(monthly(3, 7), ~D[2026-12-31]) ==
               [~D[2026-10-18], ~D[2026-11-15], ~D[2026-12-20]]
    end

    test "last Friday" do
      assert Recurrence.dates(monthly(-1, 5), ~D[2026-12-31]) ==
               [~D[2026-10-30], ~D[2026-11-27], ~D[2026-12-25]]
    end

    test "the last Sunday is the 5th one in a five-Sunday month" do
      # November 2026 has Sundays on the 1st, 8th, 15th, 22nd and 29th.
      assert Recurrence.nth_weekday(2026, 11, -1, 7) == ~D[2026-11-29]
      assert Recurrence.nth_weekday(2026, 11, 4, 7) == ~D[2026-11-22]
    end

    test "a month whose occurrence falls before the start date is skipped" do
      assert Recurrence.dates(monthly(1, 4, start_date: ~D[2026-10-02]), ~D[2026-11-30]) ==
               [~D[2026-11-05]]
    end
  end

  describe "ends" do
    test "count limits the occurrences" do
      assert length(Recurrence.dates(weekly([2], count: 8), ~D[2027-12-31])) == 8
    end

    test "until_date limits the occurrences" do
      assert List.last(Recurrence.dates(weekly([2], until_date: ~D[2026-10-20]), ~D[2027-12-31])) ==
               ~D[2026-10-20]
    end

    test "skipped dates count toward count but aren't returned" do
      s = weekly([2], count: 3, skipped_dates: [~D[2026-10-13]])
      assert Recurrence.dates(s, ~D[2027-12-31]) == [~D[2026-10-06], ~D[2026-10-20]]
    end

    test "the initial horizon is 12 months, or the end date if sooner" do
      assert Recurrence.initial_horizon(weekly([2])) == ~D[2027-10-04]
      assert Recurrence.initial_horizon(weekly([2], until_date: ~D[2027-01-31])) == ~D[2027-01-31]
      assert Recurrence.initial_horizon(weekly([2], until_date: ~D[2028-06-30])) == ~D[2027-10-04]
    end

    test "12 months of two weekdays is about 104 occurrences" do
      s = weekly([2, 4])
      assert length(Recurrence.dates(s, Recurrence.initial_horizon(s))) in 103..105
    end
  end

  describe "Colorado time across daylight saving" do
    test "7 pm stays 7 pm local after DST ends (Nov 1, 2026)" do
      s = weekly([2])
      {before, _} = Recurrence.occurrence_times(s, ~D[2026-10-27])
      {after_, _} = Recurrence.occurrence_times(s, ~D[2026-11-03])

      assert before == ~U[2026-10-28 01:00:00Z]
      assert after_ == ~U[2026-11-04 02:00:00Z]
      assert Recurrence.to_local(after_) == {~D[2026-11-03], ~T[19:00:00]}
    end

    test "7 pm stays 7 pm local after DST starts (Mar 14, 2027)" do
      s = weekly([7], start_date: ~D[2027-03-01])
      {before, _} = Recurrence.occurrence_times(s, ~D[2027-03-07])
      {after_, _} = Recurrence.occurrence_times(s, ~D[2027-03-14])

      assert Recurrence.to_local(before) == {~D[2027-03-07], ~T[19:00:00]}
      assert Recurrence.to_local(after_) == {~D[2027-03-14], ~T[19:00:00]}
    end

    test "a time in the spring-forward gap moves to just after it" do
      s = weekly([7], start_date: ~D[2027-03-01], start_time: ~T[02:30:00])
      {starts, _} = Recurrence.occurrence_times(s, ~D[2027-03-14])
      assert Recurrence.to_local(starts) == {~D[2027-03-14], ~T[03:00:00]}
    end

    test "all-day occurrences span local midnights" do
      s = weekly([5], all_day: true, span_days: 2, start_time: nil, duration_minutes: nil)

      assert Recurrence.occurrence_times(s, ~D[2026-10-30]) ==
               {~U[2026-10-30 06:00:00Z], ~U[2026-11-01 06:00:00Z]}

      # Across the change: Oct 31 (MDT) to Nov 2 (MST).
      assert Recurrence.occurrence_times(s, ~D[2026-10-31]) ==
               {~U[2026-10-31 06:00:00Z], ~U[2026-11-02 07:00:00Z]}
    end
  end
end
