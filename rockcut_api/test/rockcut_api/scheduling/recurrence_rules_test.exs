defmodule RockcutApi.Scheduling.RecurrenceRulesTest do
  @moduledoc "D39: the rules added for recurring brewery tasks, on plain maps."
  use ExUnit.Case, async: true

  alias RockcutApi.Scheduling.Recurrence

  defp rule(frequency, start_date, opts \\ []) do
    Map.merge(
      %{
        frequency: frequency,
        interval: 1,
        weekdays: [],
        week_of_month: nil,
        weekday: nil,
        day_of_month: nil,
        start_date: start_date,
        until_date: nil,
        count: nil,
        skipped_dates: []
      },
      Map.new(opts)
    )
  end

  describe "any map with the rule fields" do
    test "weekly every 4 weeks on Wednesday" do
      s = rule("weekly", ~D[2026-10-14], weekdays: [3], interval: 4)

      assert Recurrence.dates(s, ~D[2026-12-31]) ==
               [~D[2026-10-14], ~D[2026-11-11], ~D[2026-12-09]]
    end

    test "monthly by weekday" do
      s = rule("monthly_weekday", ~D[2026-10-01], week_of_month: 1, weekday: 3)

      assert Recurrence.dates(s, ~D[2026-12-31]) ==
               [~D[2026-10-07], ~D[2026-11-04], ~D[2026-12-02]]
    end
  end

  describe "monthly_day" do
    test "day 31 across a year: the last day in shorter months (S54)" do
      s = rule("monthly_day", ~D[2026-10-31], day_of_month: 31)

      assert Recurrence.dates(s, ~D[2027-10-31]) == [
               ~D[2026-10-31],
               ~D[2026-11-30],
               ~D[2026-12-31],
               ~D[2027-01-31],
               ~D[2027-02-28],
               ~D[2027-03-31],
               ~D[2027-04-30],
               ~D[2027-05-31],
               ~D[2027-06-30],
               ~D[2027-07-31],
               ~D[2027-08-31],
               ~D[2027-09-30],
               ~D[2027-10-31]
             ]
    end

    test "day 31 in a leap year gives Feb 29" do
      s = rule("monthly_day", ~D[2027-10-31], day_of_month: 31)

      assert Recurrence.dates(s, ~D[2028-03-31]) == [
               ~D[2027-10-31],
               ~D[2027-11-30],
               ~D[2027-12-31],
               ~D[2028-01-31],
               ~D[2028-02-29],
               ~D[2028-03-31]
             ]
    end

    test "a start after the day begins next month" do
      s = rule("monthly_day", ~D[2026-10-20], day_of_month: 10)

      assert Recurrence.dates(s, ~D[2027-01-10]) ==
               [~D[2026-11-10], ~D[2026-12-10], ~D[2027-01-10]]
    end
  end

  describe "monthly last weekday" do
    test "last Friday through a year (S55)" do
      s = rule("monthly_weekday", ~D[2026-10-01], week_of_month: -1, weekday: 5)

      assert Recurrence.dates(s, ~D[2027-09-30]) == [
               ~D[2026-10-30],
               ~D[2026-11-27],
               ~D[2026-12-25],
               ~D[2027-01-29],
               ~D[2027-02-26],
               ~D[2027-03-26],
               ~D[2027-04-30],
               ~D[2027-05-28],
               ~D[2027-06-25],
               ~D[2027-07-30],
               ~D[2027-08-27],
               ~D[2027-09-24]
             ]
    end
  end

  describe "quarterly_day" do
    test "day 15 from October: Oct, Jan, Apr, Jul (S56)" do
      s = rule("quarterly_day", ~D[2026-10-15], day_of_month: 15)

      assert Recurrence.dates(s, ~D[2027-10-14]) ==
               [~D[2026-10-15], ~D[2027-01-15], ~D[2027-04-15], ~D[2027-07-15]]
    end

    test "day 31 takes the last day of a shorter month" do
      s = rule("quarterly_day", ~D[2026-12-31], day_of_month: 31)

      assert Recurrence.dates(s, ~D[2027-12-31]) ==
               [~D[2026-12-31], ~D[2027-03-31], ~D[2027-06-30], ~D[2027-09-30], ~D[2027-12-31]]
    end
  end

  describe "quarterly_weekday" do
    test "first Wednesday every 3 months from the start month" do
      s = rule("quarterly_weekday", ~D[2026-10-01], week_of_month: 1, weekday: 3)

      assert Recurrence.dates(s, ~D[2027-07-31]) ==
               [~D[2026-10-07], ~D[2027-01-06], ~D[2027-04-07], ~D[2027-07-07]]
    end

    test "last Friday every 3 months" do
      s = rule("quarterly_weekday", ~D[2026-11-01], week_of_month: -1, weekday: 5)

      assert Recurrence.dates(s, ~D[2027-05-31]) ==
               [~D[2026-11-27], ~D[2027-02-26], ~D[2027-05-28]]
    end
  end

  describe "annually" do
    test "Mar 1 after 3 times (S57)" do
      s = rule("annually", ~D[2027-03-01], count: 3)

      assert Recurrence.dates(s, ~D[2032-12-31]) ==
               [~D[2027-03-01], ~D[2028-03-01], ~D[2029-03-01]]
    end

    test "from Feb 29: Feb 28 in other years, Feb 29 in leap years" do
      s = rule("annually", ~D[2028-02-29])

      assert Recurrence.dates(s, ~D[2032-03-01]) == [
               ~D[2028-02-29],
               ~D[2029-02-28],
               ~D[2030-02-28],
               ~D[2031-02-28],
               ~D[2032-02-29]
             ]
    end
  end

  describe "end and skips" do
    test "count counts a skipped date" do
      s = rule("monthly_day", ~D[2026-11-01], day_of_month: 1, count: 3)
      s = %{s | skipped_dates: [~D[2026-12-01]]}

      assert Recurrence.dates(s, ~D[2027-12-31]) == [~D[2026-11-01], ~D[2027-01-01]]
    end

    test "skipped dates are left out of each new rule" do
      s = rule("quarterly_day", ~D[2026-10-15], day_of_month: 15, skipped_dates: [~D[2027-01-15]])

      assert Recurrence.dates(s, ~D[2027-04-15]) == [~D[2026-10-15], ~D[2027-04-15]]

      s = rule("annually", ~D[2026-10-12], skipped_dates: [~D[2027-10-12]])
      assert Recurrence.dates(s, ~D[2028-10-12]) == [~D[2026-10-12], ~D[2028-10-12]]
    end

    test "until_date is included, and nothing after it" do
      s = rule("quarterly_day", ~D[2026-10-15], day_of_month: 15, until_date: ~D[2027-04-15])

      assert Recurrence.dates(s, ~D[2027-12-31]) ==
               [~D[2026-10-15], ~D[2027-01-15], ~D[2027-04-15]]

      s = %{s | until_date: ~D[2027-04-14]}
      assert Recurrence.dates(s, ~D[2027-12-31]) == [~D[2026-10-15], ~D[2027-01-15]]
    end

    test "an until_date before the start gives nothing" do
      s = rule("annually", ~D[2026-10-12], until_date: ~D[2026-10-11])
      assert Recurrence.dates(s, ~D[2027-12-31]) == []
    end
  end

  describe "rolling_horizon/2" do
    test "includes today + 12 months, so an annual series started today has next year's" do
      s = rule("annually", ~D[2026-10-12])

      assert Recurrence.rolling_horizon(s, ~D[2026-10-12]) == ~D[2027-10-12]

      assert Recurrence.dates(s, Recurrence.rolling_horizon(s, ~D[2026-10-12])) ==
               [~D[2026-10-12], ~D[2027-10-12]]
    end

    test "from Feb 29 it reaches Feb 28 next year" do
      s = rule("annually", ~D[2028-02-29])

      assert Recurrence.dates(s, Recurrence.rolling_horizon(s, ~D[2028-02-29])) ==
               [~D[2028-02-29], ~D[2029-02-28]]
    end

    test "is capped by until_date" do
      s = rule("weekly", ~D[2026-10-14], weekdays: [3], until_date: ~D[2026-12-01])
      assert Recurrence.rolling_horizon(s, ~D[2026-10-12]) == ~D[2026-12-01]
    end

    test "moves with today" do
      s = rule("weekly", ~D[2026-10-14], weekdays: [3])
      assert Recurrence.rolling_horizon(s, ~D[2026-10-13]) == ~D[2027-10-13]
    end
  end
end
