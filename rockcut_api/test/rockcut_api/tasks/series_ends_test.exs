defmodule RockcutApi.Tasks.SeriesEndsTest do
  @moduledoc """
  D42 §2.6 (an Ends-only change moves the chain's end, never a rule) and §3
  (R2: "after N times" stays a count across a split). S131, S132, S141, S142.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.TaskFixtures

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Tasks.{Event, Series, Task, TaskSeries}

  # A Wednesday: w0 = Oct 14, w1 = Oct 21, … The horizon is 2027-10-14.
  @today ~D[2026-10-14]
  @weekly_wed %{repeat: "weekly", repeat_interval: 1, repeat_weekdays: [3]}
  @weekly_thu %{repeat: "weekly", repeat_interval: 1, repeat_weekdays: [4]}
  @weekly_fri %{repeat: "weekly", repeat_interval: 1, repeat_weekdays: [5]}
  @monthly_first_wed %{
    repeat: "monthly",
    repeat_interval: 1,
    repeat_month_rule: "weekday",
    repeat_week_of_month: 1,
    repeat_weekday: 3
  }
  @never %{repeat_until: "", repeat_count: ""}

  setup do
    department_fixture("brewery")
    %{mgr: user_with_role("manager", "brewery")}
  end

  defp keg_wash!(actor, ends) do
    {:ok, first} =
      Tasks.create(
        brewery_board(),
        %{title: "Keg Wash", due_on: @today} |> Map.merge(@weekly_wed) |> Map.merge(ends),
        actor,
        @today
      )

    first
  end

  defp week(%Task{series_id: id}, n), do: on(id, Date.add(@today, 7 * n))
  defp on(series_id, date), do: Repo.get_by(Task, series_id: series_id, series_date: date)
  defp series(%Task{series_id: id}), do: Repo.get(TaskSeries, id)

  defp following(task, attrs, ctx, opts \\ []) do
    Tasks.update(
      brewery_board(),
      task,
      attrs,
      ctx.mgr,
      Keyword.merge([scope: "following", today: @today], opts)
    )
  end

  # Every occurrence date of the chain the task is in (open or not), in order.
  defp chain_dates(%Task{series_id: id}) do
    head = first_part(Repo.get!(TaskSeries, id))
    ids = [head.id | Series.chain_ids(head.id)]

    Repo.all(
      from t in Task, where: t.series_id in ^ids, order_by: t.series_date, select: t.series_date
    )
  end

  defp first_part(%TaskSeries{continues_series_id: nil} = s), do: s
  defp first_part(%TaskSeries{continues_series_id: id}), do: first_part(Repo.get!(TaskSeries, id))

  defp shown_ends(task) do
    {:ok, {rule, _}} = Series.info(task)
    {rule.until_date, rule.count}
  end

  defp preview(task, attrs) do
    {:ok, change} =
      Series.change_preview(task, Map.new(attrs, fn {k, v} -> {to_string(k), v} end))

    change
  end

  defp edits, do: Repo.all(from e in Event, where: e.action == "edited", order_by: e.id)

  describe "Ends only (§2.6)" do
    test "S131 a split series, Ends → Never from the earlier part: the monthly part stays monthly",
         ctx do
      w0 = keg_wash!(ctx.mgr, %{repeat_until: "2027-03-03"})

      {:ok, b} =
        following(week(w0, 7), Map.put(@monthly_first_wed, :repeat_until, "2027-03-03"), ctx)

      monthly = series(b)
      assert shown_ends(week(w0, 1)) == {~D[2027-03-03], nil}

      attrs = Map.merge(@weekly_wed, @never)
      assert %{kind: "ends", removes_open: 0, removes_changed: 0} = preview(week(w0, 1), attrs)
      before = length(edits())

      assert {:ok, _} = following(week(w0, 1), attrs, ctx)

      # Same parts, same rules; the monthly part now runs to the horizon.
      after_b = Repo.get!(TaskSeries, monthly.id)
      assert {after_b.frequency, after_b.week_of_month, after_b.until_date} == {"monthly", 1, nil}
      assert {series(w0).frequency, series(w0).until_date} == {"weekly", ~D[2026-12-01]}
      assert List.last(chain_dates(w0)) == ~D[2027-10-06]
      assert on(monthly.id, ~D[2027-06-02])
      assert shown_ends(week(w0, 1)) == {nil, nil}

      # One History entry, saying what changed.
      assert length(edits()) == before + 1

      assert %Event{detail: %{"ends_only" => true, "removed" => 0, "repeat" => repeat}} =
               List.last(edits())

      assert repeat["from"]["until"] == "2027-03-03"
      refute Map.has_key?(repeat["to"], "until")
    end

    test "S132 an unsplit weekly series ending on a date → After 5 times: removes the rest",
         ctx do
      # Wednesdays 10/14 … 1/27: 16.
      w0 = keg_wash!(ctx.mgr, %{repeat_until: "2027-01-27"})
      assert length(chain_dates(w0)) == 16
      attrs = Map.merge(@weekly_wed, %{repeat_until: "", repeat_count: 5})

      assert %{kind: "ends", removes_open: 11, removes_changed: 0} = preview(week(w0, 1), attrs)
      assert {:ok, _} = following(week(w0, 1), attrs, ctx)

      assert chain_dates(w0) == Enum.map(0..4, &Date.add(@today, 7 * &1))
      assert {series(w0).until_date, series(w0).count} == {nil, 5}
      assert shown_ends(w0) == {nil, 5}
      assert %Event{detail: %{"removed" => 11, "kept" => 0}} = List.last(edits())
    end

    test "an unsplit series extended: nothing removed, the new dates made", ctx do
      w0 = keg_wash!(ctx.mgr, %{repeat_until: "2026-12-16"})
      first_id = w0.series_id
      attrs = Map.merge(@weekly_wed, @never)

      assert %{kind: "ends", removes_open: 0} = preview(week(w0, 2), attrs)
      assert {:ok, task} = following(week(w0, 2), attrs, ctx)

      # Not split: the same series and occurrence.
      assert task.series_id == first_id
      assert week(w0, 2).id == task.id
      assert List.last(chain_dates(w0)) == ~D[2027-10-13]
      assert {series(w0).until_date, series(w0).count} == {nil, nil}
    end

    test "occurrences before the new end are left alone, a changed one included", ctx do
      w0 = keg_wash!(ctx.mgr, %{repeat_until: "2027-01-27"})

      {:ok, _} =
        Tasks.update(brewery_board(), week(w0, 3), %{title: "Own"}, ctx.mgr, scope: "this")

      w4 = week(w0, 4)

      assert {:ok, _} =
               following(week(w0, 1), Map.merge(@weekly_wed, %{repeat_until: "2026-12-30"}), ctx)

      assert week(w0, 3).title == "Own"
      assert week(w0, 4) == w4
      assert List.last(chain_dates(w0)) == ~D[2026-12-30]
    end

    test "a changed one after the new end: keep keeps it, remove removes it", ctx do
      for {changed, kept} <- [keep: true, remove: false] do
        w0 = keg_wash!(ctx.mgr, %{repeat_until: "2027-01-27"})

        {:ok, _} =
          Tasks.update(brewery_board(), week(w0, 10), %{title: "Own"}, ctx.mgr, scope: "this")

        attrs = Map.merge(@weekly_wed, %{repeat_until: "", repeat_count: 5})
        assert %{removes_open: 10, removes_changed: 1} = preview(week(w0, 1), attrs)
        assert {:ok, _} = following(week(w0, 1), attrs, ctx, changed: changed)
        assert !!week(w0, 10) == kept
        assert length(chain_dates(w0)) == if(kept, do: 6, else: 5)
      end
    end

    test "an end before this occurrence is refused, as a split's is", ctx do
      w0 = keg_wash!(ctx.mgr, %{repeat_until: "2027-01-27"})
      w5 = week(w0, 5)

      assert {:error, %Ecto.Changeset{} = cs} =
               following(w5, Map.merge(@weekly_wed, %{repeat_until: "", repeat_count: 3}), ctx)

      assert {"the series already has 5 dates before this one; choose a larger number", _} =
               cs.errors[:count]

      assert {:error, %Ecto.Changeset{} = cs} =
               following(w5, Map.merge(@weekly_wed, %{repeat_until: "2026-11-04"}), ctx)

      assert cs.errors[:until_date]

      assert {:error, %Ecto.Changeset{}} =
               following(
                 w5,
                 Map.merge(@weekly_wed, %{repeat_until: "2027-01-06", repeat_count: 30}),
                 ctx
               )

      assert {:error, %Ecto.Changeset{}} = Series.change_preview(w5, %{"repeat_count" => "3"})
      assert length(chain_dates(w0)) == 16
    end

    test "with a content change too: one History entry with both", ctx do
      w0 = keg_wash!(ctx.mgr, %{repeat_until: "2027-01-27"})
      attrs = @weekly_wed |> Map.merge(%{repeat_until: "", repeat_count: 5, title: "Keg Wash v2"})

      assert {:ok, _} = following(week(w0, 1), attrs, ctx)
      assert [w0.title | List.duplicate("Keg Wash v2", 4)] == Enum.map(0..4, &week(w0, &1).title)

      assert [%Event{detail: %{"ends_only" => true, "to" => %{"title" => "Keg Wash v2"}}}] =
               edits()
    end

    test "the end moved into an earlier part: the later part goes", ctx do
      w0 = keg_wash!(ctx.mgr, %{})
      {:ok, b} = following(week(w0, 7), @monthly_first_wed, ctx)

      assert {:ok, _} = following(week(w0, 1), Map.merge(@weekly_wed, %{repeat_count: 3}), ctx)
      refute Repo.get(TaskSeries, b.series_id)
      assert chain_dates(w0) == Enum.map(0..2, &Date.add(@today, 7 * &1))
      assert {series(w0).count, series(w0).internal_end} == {3, false}
      assert shown_ends(w0) == {nil, 3}
    end

    test "a rule change is still a split, and the preview says so", ctx do
      w0 = keg_wash!(ctx.mgr, %{})
      assert %{kind: "rule", removes_open: 51} = preview(week(w0, 1), @weekly_fri)
      assert %{kind: "same", removes_open: 0} = preview(week(w0, 1), @weekly_wed)
      assert {:ok, fri} = following(week(w0, 1), @weekly_fri, ctx)
      assert fri.series_id != w0.series_id
    end
  end

  describe "After N times across a split (§3, R2)" do
    # Weekly Wed after 10 times (10/14 … 12/16); at the 6th (11/18) to Thursdays.
    defp split_count!(ctx) do
      w0 = keg_wash!(ctx.mgr, %{repeat_count: 10})
      {:ok, thu} = following(week(w0, 5), @weekly_thu, ctx)
      {w0, thu}
    end

    test "S141 every part shows After 10 times; Wed → Fri from the 3rd keeps 10", ctx do
      {w0, thu} = split_count!(ctx)
      assert {series(thu).until_date, series(thu).count} == {nil, 5}
      assert shown_ends(week(w0, 1)) == {nil, 10}
      assert shown_ends(thu) == {nil, 10}
      assert length(chain_dates(w0)) == 10

      assert {:ok, fri} = following(week(w0, 2), @weekly_fri, ctx)

      fridays = Enum.map(0..7, &Date.add(~D[2026-10-30], 7 * &1))
      assert chain_dates(w0) == [~D[2026-10-14], ~D[2026-10-21] | fridays]
      assert List.last(fridays) == ~D[2026-12-18]
      assert shown_ends(w0) == {nil, 10}
      assert shown_ends(fri) == {nil, 10}
    end

    test "S142 Ends → After 12 times from the later part: 12, the Thursday rule unchanged", ctx do
      {w0, thu} = split_count!(ctx)
      thu_id = thu.series_id
      last_thu = on(thu_id, ~D[2026-12-17])
      attrs = Map.put(@weekly_thu, :repeat_count, 12)

      assert %{kind: "ends", removes_open: 0} = preview(last_thu, attrs)
      assert {:ok, _} = following(last_thu, attrs, ctx)

      t = Repo.get!(TaskSeries, thu_id)
      assert {t.weekdays, t.start_date, t.count, t.until_date} == {[4], ~D[2026-11-18], 7, nil}
      assert length(chain_dates(w0)) == 12
      assert List.last(chain_dates(w0)) == ~D[2026-12-31]
      assert shown_ends(w0) == {nil, 12}
    end

    test "a part stored as a date (before D42) still behaves as a date", ctx do
      {w0, thu} = split_count!(ctx)

      # As D39 stored it: the date of the last time.
      series(thu)
      |> Ecto.Changeset.change(until_date: ~D[2026-12-17], count: nil)
      |> Repo.update!()

      assert shown_ends(week(w0, 1)) == {~D[2026-12-17], nil}

      # A rule change from before keeps the date.
      assert {:ok, fri} = following(week(w0, 2), @weekly_fri, ctx)
      assert {series(fri).until_date, series(fri).count} == {~D[2026-12-17], nil}
      assert List.last(chain_dates(w0)) == ~D[2026-12-11]

      # And an Ends-only change moves it.
      assert {:ok, _} = following(fri, Map.merge(@weekly_fri, %{repeat_until: "2027-01-08"}), ctx)
      assert List.last(chain_dates(w0)) == ~D[2027-01-08]
    end
  end
end
