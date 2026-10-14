defmodule RockcutApi.Tasks.SeriesTest do
  use RockcutApi.DataCase, async: false

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures

  alias RockcutApi.Tasks
  alias RockcutApi.Tasks.{Event, Series, Task, TaskSeries}

  # A Wednesday. Its rolling horizon is 2027-10-14 (inclusive).
  @today ~D[2026-10-14]

  setup do
    department_fixture("brewery")

    %{
      brewer: user_with_role("employee", "brewery", %{name: "Kate Brewer"}),
      brewer2: user_with_role("employee", "brewery", %{name: "Sam Brewer"})
    }
  end

  defp repeat!(actor, attrs, today \\ @today) do
    {:ok, first} = Tasks.create(Map.merge(%{title: "Keg Wash"}, attrs), actor, today)
    first
  end

  defp dates(%Task{series_id: id}) do
    Repo.all(from t in Task, where: t.series_id == ^id, order_by: t.series_date, select: t.due_on)
  end

  defp series(%Task{series_id: id}), do: Repo.get!(TaskSeries, id)

  defp errors(cs), do: Keyword.keys(cs.errors)

  describe "create" do
    test "weekly on Wed reaches 11 months out, and through today + 12 months (S52)", ctx do
      first =
        repeat!(ctx.brewer, %{
          due_on: @today,
          repeat: "weekly",
          repeat_weekdays: [3],
          repeat_interval: 1
        })

      ds = dates(first)
      assert first.due_on == @today
      assert first.series_date == @today
      assert hd(ds) == @today
      assert List.last(ds) == ~D[2027-10-13]
      assert length(ds) == 53
      assert Enum.all?(ds, &(Date.day_of_week(&1) == 3))
      assert ~D[2027-09-15] in ds
      assert series(first).generated_through == ~D[2027-10-14]
    end

    test "every 2 weeks on Mon and Thu, from this week (S53)", ctx do
      first =
        repeat!(ctx.brewer, %{
          title: "CIP brite tanks",
          due_on: @today,
          repeat: "weekly",
          repeat_weekdays: "1,4",
          repeat_interval: "2"
        })

      assert Enum.take(dates(first), 4) ==
               [~D[2026-10-15], ~D[2026-10-26], ~D[2026-10-29], ~D[2026-11-09]]

      assert first.due_on == ~D[2026-10-15]
    end

    test "monthly on day 31: the last day in shorter months (S54)", ctx do
      first =
        repeat!(ctx.brewer, %{
          title: "Inventory",
          due_on: ~D[2026-10-31],
          repeat: "monthly",
          repeat_month_rule: "day",
          repeat_day_of_month: 31
        })

      ds = dates(first)

      assert Enum.take(ds, 5) ==
               [~D[2026-10-31], ~D[2026-11-30], ~D[2026-12-31], ~D[2027-01-31], ~D[2027-02-28]]

      assert List.last(ds) == ~D[2027-09-30]
      assert length(ds) == 12
    end

    test "monthly on the last Friday (S55)", ctx do
      first =
        repeat!(ctx.brewer, %{
          title: "Glycol check",
          due_on: @today,
          repeat: "monthly",
          repeat_month_rule: "weekday",
          repeat_week_of_month: -1,
          repeat_weekday: 5
        })

      assert Enum.take(dates(first), 3) == [~D[2026-10-30], ~D[2026-11-27], ~D[2026-12-25]]
    end

    test "quarterly on day 15 from Oct 15: Oct, Jan, Apr, Jul (S56)", ctx do
      first =
        repeat!(ctx.brewer, %{
          title: "Calibrate pH meter",
          due_on: ~D[2026-10-15],
          repeat: "quarterly",
          repeat_month_rule: "day",
          repeat_day_of_month: 15
        })

      assert dates(first) == [~D[2026-10-15], ~D[2027-01-15], ~D[2027-04-15], ~D[2027-07-15]]
    end

    test "quarterly on the first Monday", ctx do
      first =
        repeat!(ctx.brewer, %{
          due_on: @today,
          repeat: "quarterly",
          repeat_month_rule: "weekday",
          repeat_week_of_month: 1,
          repeat_weekday: 1
        })

      # October's first Monday (Oct 5) is before the start.
      assert dates(first) == [~D[2027-01-04], ~D[2027-04-05], ~D[2027-07-05], ~D[2027-10-04]]
    end

    test "annually on Mar 1, after 3 times (S57)", ctx do
      first =
        repeat!(ctx.brewer, %{
          title: "TTB permit renewal",
          due_on: ~D[2027-03-01],
          repeat: "annually",
          repeat_count: 3
        })

      assert dates(first) == [~D[2027-03-01]]

      assert {:ok, 2} = Series.top_up(~D[2029-03-01])
      assert dates(first) == [~D[2027-03-01], ~D[2028-03-01], ~D[2029-03-01]]

      assert {:ok, 0} = Series.top_up(~D[2032-03-01])
      assert length(dates(first)) == 3
    end

    test "an annual series started today already has next year's", ctx do
      first = repeat!(ctx.brewer, %{due_on: @today, repeat: "annually"})
      assert dates(first) == [@today, ~D[2027-10-14]]
    end

    test "occurrences copy title, notes and assignee, and are open", ctx do
      first =
        repeat!(ctx.brewer, %{
          due_on: @today,
          notes: "Both kegs",
          assignee_id: ctx.brewer2.id,
          repeat: "annually"
        })

      for t <- Repo.all(from t in Task, where: t.series_id == ^first.series_id) do
        assert {t.title, t.notes, t.assignee_id} == {"Keg Wash", "Both kegs", ctx.brewer2.id}
        assert t.completed_at == nil
        assert t.series_exception == false
        assert t.created_by_id == ctx.brewer.id
      end
    end

    test "each occurrence goes at the bottom of its day", ctx do
      next_wed = Date.add(@today, 7)
      {:ok, _} = Tasks.create(%{title: "A", due_on: @today}, ctx.brewer)
      {:ok, _} = Tasks.create(%{title: "B", due_on: @today}, ctx.brewer)
      {:ok, _} = Tasks.create(%{title: "C", due_on: next_wed}, ctx.brewer)

      first = repeat!(ctx.brewer, %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]})

      positions =
        Repo.all(
          from t in Task,
            where: t.series_id == ^first.series_id,
            select: {t.due_on, t.position}
        )
        |> Map.new()

      assert positions[@today] == 3
      assert positions[next_wed] == 2
      assert positions[Date.add(@today, 14)] == 1
    end

    test "logs one `created` event, with the rule, on the first occurrence", ctx do
      first =
        repeat!(ctx.brewer, %{
          due_on: @today,
          repeat: "weekly",
          repeat_weekdays: [3],
          repeat_until: "2027-03-31"
        })

      assert [ev] = Repo.all(from e in Event, where: e.action == "created")
      assert ev.task_id == first.id
      assert ev.actor_id == ctx.brewer.id
      assert ev.detail["due_on"] == "2026-10-14"

      assert ev.detail["repeat"] == %{
               "frequency" => "weekly",
               "interval" => 1,
               "weekdays" => [3],
               "until" => "2027-03-31"
             }

      assert Repo.aggregate(Event, :count) == 1
    end

    test "with no day: repeat_needs_day, and nothing is saved", ctx do
      for due_on <- [nil, ""] do
        assert {:error, :repeat_needs_day} =
                 Tasks.create(
                   %{title: "Keg Wash", due_on: due_on, repeat: "weekly", repeat_weekdays: [3]},
                   ctx.brewer,
                   @today
                 )
      end

      assert Repo.aggregate(TaskSeries, :count) == 0
      assert Repo.aggregate(Task, :count) == 0
    end

    test "repeat never or empty makes a one-off task", ctx do
      for r <- ["never", ""] do
        {:ok, task} =
          Tasks.create(%{title: "One-off", due_on: @today, repeat: r}, ctx.brewer, @today)

        assert task.series_id == nil
      end

      assert Repo.aggregate(TaskSeries, :count) == 0
    end

    test "an assignee must be a Brewery member", ctx do
      outsider = user_with_role("employee", "bar")

      assert {:error, cs} =
               Tasks.create(
                 %{title: "K", due_on: @today, repeat: "annually", assignee_id: outsider.id},
                 ctx.brewer,
                 @today
               )

      assert :assignee_id in errors(cs)
    end
  end

  describe "invalid rules" do
    @base %{title: "Keg Wash", due_on: ~D[2026-10-14]}

    for {name, attrs, field} <- [
          {"weekly with no weekdays", %{repeat: "weekly"}, :weekdays},
          {"weekly with a bad weekday", %{repeat: "weekly", repeat_weekdays: [8]}, :weekdays},
          {"weekly every 5 weeks", %{repeat: "weekly", repeat_weekdays: [3], repeat_interval: 5},
           :interval},
          {"monthly with no month rule", %{repeat: "monthly"}, :month_rule},
          {"monthly with an unknown month rule", %{repeat: "monthly", repeat_month_rule: "nth"},
           :month_rule},
          {"monthly day 0",
           %{repeat: "monthly", repeat_month_rule: "day", repeat_day_of_month: 0}, :day_of_month},
          {"monthly day 32",
           %{repeat: "monthly", repeat_month_rule: "day", repeat_day_of_month: 32},
           :day_of_month},
          {"monthly day missing", %{repeat: "monthly", repeat_month_rule: "day"}, :day_of_month},
          {"quarterly 5th weekday",
           %{
             repeat: "quarterly",
             repeat_month_rule: "weekday",
             repeat_week_of_month: 5,
             repeat_weekday: 2
           }, :week_of_month},
          {"quarterly weekday 8",
           %{
             repeat: "quarterly",
             repeat_month_rule: "weekday",
             repeat_week_of_month: 1,
             repeat_weekday: 8
           }, :weekday},
          {"annually every 2", %{repeat: "annually", repeat_interval: 2}, :interval},
          {"an unknown repeat", %{repeat: "daily"}, :frequency},
          {"an end date and a count",
           %{repeat: "annually", repeat_until: "2028-01-01", repeat_count: 2}, :count},
          {"count 0", %{repeat: "annually", repeat_count: 0}, :count},
          {"count 401", %{repeat: "annually", repeat_count: 401}, :count},
          {"an end date before the start", %{repeat: "annually", repeat_until: "2026-10-13"},
           :until_date},
          {"a rule with no dates in range",
           %{repeat: "weekly", repeat_weekdays: [1], repeat_until: "2026-10-14"}, :repeat}
        ] do
      test name, ctx do
        assert {:error, %Ecto.Changeset{} = cs} =
                 Tasks.create(
                   Map.merge(@base, unquote(Macro.escape(attrs))),
                   ctx.brewer,
                   @today
                 )

        assert unquote(field) in errors(cs)
        assert Repo.aggregate(TaskSeries, :count) == 0
        assert Repo.aggregate(Task, :count) == 0
      end
    end

    test "a count of 400 is allowed", ctx do
      assert %Task{} =
               repeat!(ctx.brewer, %{due_on: @today, repeat: "annually", repeat_count: 400})
    end
  end

  describe "TaskSeries" do
    test "rule_kind/1 maps the spec's rule to the Recurrence kind" do
      assert TaskSeries.rule_kind(%{frequency: "weekly"}) == "weekly"
      assert TaskSeries.rule_kind(%{frequency: "monthly", month_rule: "day"}) == "monthly_day"

      assert TaskSeries.rule_kind(%{frequency: "monthly", month_rule: "weekday"}) ==
               "monthly_weekday"

      assert TaskSeries.rule_kind(%{frequency: "quarterly", month_rule: "day"}) == "quarterly_day"

      assert TaskSeries.rule_kind(%{frequency: "quarterly", month_rule: "weekday"}) ==
               "quarterly_weekday"

      assert TaskSeries.rule_kind(%{frequency: "annually", month_rule: nil}) == "annually"
    end

    test "options that don't belong to the rule are cleared" do
      cs =
        TaskSeries.changeset(%TaskSeries{}, %{
          title: "K",
          start_date: @today,
          frequency: "monthly",
          month_rule: "day",
          day_of_month: 3,
          weekdays: [1],
          week_of_month: 2,
          weekday: 4
        })

      assert cs.valid?
      s = Ecto.Changeset.apply_changes(cs)
      assert {s.weekdays, s.week_of_month, s.weekday, s.day_of_month} == {nil, nil, nil, 3}
    end

    test "the task changeset never sets the series fields" do
      cs =
        Task.changeset(%Task{}, %{
          title: "T",
          series_id: 5,
          series_date: @today,
          series_exception: true
        })

      refute Map.has_key?(cs.changes, :series_id)
      refute Map.has_key?(cs.changes, :series_date)
      refute Map.has_key?(cs.changes, :series_exception)
    end
  end

  describe "top_up (S66)" do
    test "a day later adds exactly the new date; a second run adds nothing", ctx do
      first =
        repeat!(ctx.brewer, %{
          due_on: @today,
          repeat: "weekly",
          repeat_weekdays: Enum.to_list(1..7)
        })

      before = dates(first)
      assert List.last(before) == ~D[2027-10-14]

      assert {:ok, 0} = Series.top_up(@today)
      assert {:ok, 1} = Series.top_up(Date.add(@today, 1))
      assert dates(first) == before ++ [~D[2027-10-15]]
      assert {:ok, 0} = Series.top_up(Date.add(@today, 1))
      assert series(first).generated_through == ~D[2027-10-15]
    end

    test "a weekly series a week later gets one more week, at the bottom of its day", ctx do
      first = repeat!(ctx.brewer, %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]})

      {:ok, _} =
        Tasks.create(%{title: "Already there", due_on: ~D[2027-10-20]}, ctx.brewer)

      assert {:ok, 1} = Series.top_up(Date.add(@today, 7))
      assert List.last(dates(first)) == ~D[2027-10-20]

      new = Repo.get_by!(Task, series_id: first.series_id, series_date: ~D[2027-10-20])
      assert new.position == 2
      assert {:ok, 0} = Series.top_up(Date.add(@today, 7))
    end

    test "writes no History", ctx do
      repeat!(ctx.brewer, %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]})
      events = Repo.aggregate(Event, :count)
      assert {:ok, 4} = Series.top_up(Date.add(@today, 28))
      assert Repo.aggregate(Event, :count) == events
    end

    test "never goes past until_date", ctx do
      first =
        repeat!(ctx.brewer, %{
          due_on: @today,
          repeat: "weekly",
          repeat_weekdays: [3],
          repeat_until: "2027-11-01"
        })

      assert {:ok, 2} = Series.top_up(~D[2026-12-31])
      assert Enum.take(dates(first), -2) == [~D[2027-10-20], ~D[2027-10-27]]
      assert series(first).generated_through == ~D[2027-11-01]
      assert {:ok, 0} = Series.top_up(~D[2028-06-01])
      assert List.last(dates(first)) == ~D[2027-10-27]
    end

    test "never goes past count", ctx do
      first =
        repeat!(ctx.brewer, %{
          due_on: @today,
          repeat: "weekly",
          repeat_weekdays: [3],
          repeat_count: 54
        })

      assert length(dates(first)) == 53
      assert {:ok, 1} = Series.top_up(Date.add(@today, 7))
      assert {:ok, 0} = Series.top_up(Date.add(@today, 70))
      assert length(dates(first)) == 54
    end

    test "never fills a skipped date", ctx do
      first = repeat!(ctx.brewer, %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]})

      series(first)
      |> Ecto.Changeset.change(skipped_dates: [~D[2027-10-20]])
      |> Repo.update!()

      assert {:ok, 1} = Series.top_up(Date.add(@today, 14))
      refute ~D[2027-10-20] in dates(first)
      assert ~D[2027-10-27] in dates(first)
    end

    test "a date that already exists isn't made twice", ctx do
      first = repeat!(ctx.brewer, %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]})

      # A run that died after inserting but before moving generated_through.
      %Task{
        department_id: first.department_id,
        title: "Keg Wash",
        due_on: ~D[2027-10-20],
        series_id: first.series_id,
        series_date: ~D[2027-10-20]
      }
      |> Repo.insert!()

      assert {:ok, 0} = Series.top_up(Date.add(@today, 7))
      assert Enum.count(dates(first), &(&1 == ~D[2027-10-20])) == 1
      assert series(first).generated_through == ~D[2027-10-21]
    end
  end

  describe "delete \"this\" (S64)" do
    test "it's gone, skipped, logged, and a later top-up doesn't bring it back", ctx do
      first = repeat!(ctx.brewer, %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]})
      next = Repo.get_by!(Task, series_id: first.series_id, series_date: Date.add(@today, 7))

      assert {:ok, :deleted} = Series.delete(next, "this", ctx.brewer)

      refute Repo.get(Task, next.id)
      assert Date.add(@today, 7) in series(first).skipped_dates

      assert [ev] = Repo.all(from e in Event, where: e.action == "deleted")
      assert {ev.task_id, ev.title} == {next.id, "Keg Wash"}

      assert {:ok, 1} = Series.top_up(Date.add(@today, 7))
      refute Date.add(@today, 7) in dates(first)
      assert Date.add(@today, 14) in dates(first)
    end

    test "a one-off task is simply deleted", ctx do
      {:ok, task} = Tasks.create(%{title: "One-off", due_on: @today}, ctx.brewer)
      assert {:ok, :deleted} = Series.delete(task, "this", ctx.brewer)
      refute Repo.get(Task, task.id)
    end
  end

  test "completing one occurrence leaves the others open (S58)", ctx do
    first = repeat!(ctx.brewer, %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]})

    assert {:ok, done} = Tasks.complete(first, nil, ctx.brewer, @today)
    assert done.completed_on == @today

    open =
      Repo.all(
        from t in Task,
          where: t.series_id == ^first.series_id and is_nil(t.completed_at),
          select: t.due_on
      )

    assert length(open) == 52
    assert Date.add(@today, 7) in open
  end
end
