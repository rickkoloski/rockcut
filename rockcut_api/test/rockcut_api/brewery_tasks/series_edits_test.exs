defmodule RockcutApi.BreweryTasks.SeriesEditsTest do
  @moduledoc "D39: changing a recurring task (spec \"Changing one\", Decisions 2–4)."
  use RockcutApi.DataCase, async: false

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures

  alias RockcutApi.{Accounts, BreweryTasks}
  alias RockcutApi.BreweryTasks.{Event, Series, Task, TaskSeries}

  # A Wednesday. "Keg Wash" every Wed: w0 = Oct 14, w1 = Oct 21, w2 = Oct 28, …
  @today ~D[2026-10-14]

  setup do
    department_fixture("brewery")

    brewer = user_with_role("employee", "brewery", %{name: "Kate Brewer"})
    brewer2 = user_with_role("employee", "brewery", %{name: "Sam Brewer"})
    %{brewer: brewer, brewer2: brewer2}
  end

  defp keg_wash!(actor, attrs \\ %{}) do
    {:ok, first} =
      BreweryTasks.create(
        Map.merge(
          %{title: "Keg Wash", due_on: @today, repeat: "weekly", repeat_weekdays: [3]},
          attrs
        ),
        actor,
        @today
      )

    first
  end

  # The occurrence the rule made for the nth Wednesday from today.
  defp week(%Task{series_id: id}, n), do: on(id, Date.add(@today, 7 * n))
  defp on(series_id, date), do: Repo.get_by(Task, series_id: series_id, series_date: date)

  defp reload(%Task{id: id}), do: Repo.get(Task, id)
  defp series(%Task{series_id: id}), do: Repo.get(TaskSeries, id)

  defp series_tasks(series_id) do
    Repo.all(from t in Task, where: t.series_id == ^series_id, order_by: t.series_date)
  end

  defp events(action), do: Repo.all(from e in Event, where: e.action == ^action, order_by: e.id)
  defp event_count, do: Repo.aggregate(Event, :count)

  describe "moves" do
    test "a move to another day is an exception with no second copy (S59)", ctx do
      w0 = keg_wash!(ctx.brewer)

      assert {:ok, moved} = BreweryTasks.move(w0, ~D[2026-10-15], nil, ctx.brewer)

      assert {moved.due_on, moved.series_date, moved.series_exception} ==
               {~D[2026-10-15], @today, true}

      assert {:ok, _} = Series.top_up(Date.add(@today, 30))

      assert Repo.all(from t in Task, where: t.due_on == ^@today) == []
      assert week(w0, 1).due_on == ~D[2026-10-21]
      refute week(w0, 1).series_exception
    end

    test "reordering within the same day isn't a change", ctx do
      w0 = keg_wash!(ctx.brewer)
      {:ok, other} = BreweryTasks.create(%{title: "Other", due_on: @today}, ctx.brewer)

      assert {:ok, moved} = BreweryTasks.move(other, @today, w0.id, ctx.brewer)
      assert moved.position == 1
      refute reload(w0).series_exception
      assert {:ok, _} = BreweryTasks.move(w0, @today, other.id, ctx.brewer)
      refute reload(w0).series_exception
    end

    test "onto the Future list it becomes a one-off, and isn't made again (Decision 4)", ctx do
      w0 = keg_wash!(ctx.brewer)
      w1 = week(w0, 1)

      assert {:ok, one_off} = BreweryTasks.move(w1, nil, nil, ctx.brewer)

      assert {one_off.due_on, one_off.series_id, one_off.series_date, one_off.series_exception} ==
               {nil, nil, nil, false}

      assert ~D[2026-10-21] in series(w0).skipped_dates
      assert [%Event{detail: %{"one_off" => true}}] = events("moved")

      assert {:ok, _} = Series.top_up(Date.add(@today, 30))
      assert on(w0.series_id, ~D[2026-10-21]) == nil
    end

    test "the Day field set to No day, with no scope, also makes a one-off", ctx do
      w2 = keg_wash!(ctx.brewer) |> week(2)

      assert {:ok, one_off} = BreweryTasks.update(w2, %{due_on: nil}, ctx.brewer)
      assert {one_off.due_on, one_off.series_id} == {nil, nil}
    end

    test "a day change in an edit with no scope is just this one", ctx do
      w1 = keg_wash!(ctx.brewer) |> week(1)

      assert {:ok, moved} = BreweryTasks.update(w1, %{due_on: ~D[2026-10-22]}, ctx.brewer)
      assert {moved.due_on, moved.series_exception} == {~D[2026-10-22], true}
    end

    test "Move all to today on three missed occurrences (S65)", ctx do
      w0 = keg_wash!(ctx.brewer)
      today = ~D[2026-11-04]

      {:ok, board} = BreweryTasks.board(today, today, today)

      assert Enum.map(board.unfinished, & &1.planned_on) ==
               [~D[2026-10-14], ~D[2026-10-21], ~D[2026-10-28]]

      assert {:ok, 3} = BreweryTasks.move_overdue_to_today(ctx.brewer, today)

      on_today = Repo.all(from t in Task, where: t.due_on == ^today, order_by: t.position)

      assert Enum.map(on_today, &{&1.series_date, &1.series_exception}) == [
               {~D[2026-11-04], false},
               {~D[2026-10-14], true},
               {~D[2026-10-21], true},
               {~D[2026-10-28], true}
             ]

      assert Enum.all?(on_today, &(&1.series_id == w0.series_id))
    end
  end

  describe "edit \"this\" (S60)" do
    test "only that occurrence changes, and it becomes an exception", ctx do
      w0 = keg_wash!(ctx.brewer)
      w1 = week(w0, 1)

      assert {:ok, edited} =
               BreweryTasks.update(w1, %{title: "Keg Wash + sanitize"}, ctx.brewer, scope: "this")

      assert {edited.title, edited.series_exception} == {"Keg Wash + sanitize", true}
      assert week(w0, 2).title == "Keg Wash"
      assert reload(w0).title == "Keg Wash"
      assert series(w0).title == "Keg Wash"

      assert [%Event{task_id: id, detail: %{"scope" => "this"}}] = events("edited")
      assert id == w1.id
    end

    test "repeat params are ignored", ctx do
      w1 = keg_wash!(ctx.brewer) |> week(1)

      assert {:ok, edited} =
               BreweryTasks.update(w1, %{notes: "N", repeat: "annually"}, ctx.brewer,
                 scope: "this"
               )

      assert edited.series_id == w1.series_id
      assert series(w1).frequency == "weekly"
    end
  end

  describe "edit \"following\", content only (S61)" do
    test "later open, non-exception occurrences change; the rest keep their own", ctx do
      w0 = keg_wash!(ctx.brewer)

      # S59 and S60 first, plus a later exception and a later finished one.
      {:ok, _} = BreweryTasks.move(w0, ~D[2026-10-15], nil, ctx.brewer)

      {:ok, _} =
        BreweryTasks.update(week(w0, 1), %{title: "Keg Wash + sanitize"}, ctx.brewer,
          scope: "this"
        )

      {:ok, _} =
        BreweryTasks.update(week(w0, 5), %{title: "Own title"}, ctx.brewer, scope: "this")

      {:ok, _} = BreweryTasks.complete(week(w0, 4), "planned_day", ctx.brewer, @today)

      before = event_count()
      w3 = week(w0, 3)

      assert {:ok, edited} =
               BreweryTasks.update(w3, %{assignee_id: ctx.brewer2.id}, ctx.brewer,
                 scope: "following"
               )

      assert edited.assignee_id == ctx.brewer2.id
      assert series(w0).assignee_id == ctx.brewer2.id

      # Earlier ones, the finished one and the exception don't change.
      for n <- [0, 1, 2, 4, 5], do: assert(week(w0, n).assignee_id == nil)
      assert week(w0, 1).title == "Keg Wash + sanitize"
      assert week(w0, 5).title == "Own title"

      for n <- [6, 10, 52], do: assert(week(w0, n).assignee_id == ctx.brewer2.id)

      assert event_count() == before + 1
      assert %Event{task_id: id, detail: detail} = List.last(events("edited"))
      assert id == w3.id

      assert %{"scope" => "following", "from" => %{"assignee_id" => nil}, "to" => to} = detail
      assert to == %{"assignee_id" => ctx.brewer2.id}

      # History names the assignee.
      assert BreweryTasks.list_events(w3.id).names.users[ctx.brewer2.id] == "Sam Brewer"

      # New occurrences from the top-up take the series' content.
      assert {:ok, 1} = Series.top_up(Date.add(@today, 7))
      assert week(w0, 53).assignee_id == ctx.brewer2.id
    end

    test "this occurrence takes the change even if it's an exception", ctx do
      w0 = keg_wash!(ctx.brewer)
      {:ok, _} = BreweryTasks.update(week(w0, 2), %{notes: "Mine"}, ctx.brewer, scope: "this")

      assert {:ok, edited} =
               BreweryTasks.update(week(w0, 2), %{title: "Keg Wash v2"}, ctx.brewer,
                 scope: "following"
               )

      assert {edited.title, edited.notes, edited.series_exception} ==
               {"Keg Wash v2", "Mine", true}

      assert week(w0, 3).title == "Keg Wash v2"
      assert week(w0, 1).title == "Keg Wash"
    end

    test "a day change goes to this one only", ctx do
      w0 = keg_wash!(ctx.brewer)

      assert {:ok, edited} =
               BreweryTasks.update(
                 week(w0, 2),
                 %{title: "KW", due_on: ~D[2026-10-29]},
                 ctx.brewer,
                 scope: "following"
               )

      assert {edited.title, edited.due_on, edited.series_exception} ==
               {"KW", ~D[2026-10-29], true}

      assert {week(w0, 3).title, week(w0, 3).due_on} == {"KW", ~D[2026-11-04]}
    end

    test "unchanged repeat params are a content edit, not a split", ctx do
      w0 = keg_wash!(ctx.brewer)

      assert {:ok, edited} =
               BreweryTasks.update(
                 week(w0, 2),
                 %{title: "KW", repeat: "weekly", repeat_weekdays: "3", repeat_interval: "1"},
                 ctx.brewer,
                 scope: "following"
               )

      assert edited.series_id == w0.series_id
      assert series(w0).until_date == nil
    end

    test "an invalid title is refused", ctx do
      w1 = keg_wash!(ctx.brewer) |> week(1)

      assert {:error, %Ecto.Changeset{}} =
               BreweryTasks.update(w1, %{title: " "}, ctx.brewer, scope: "following")
    end
  end

  describe "edit \"following\" with a new rule (S62)" do
    test "the new rule's first date isn't this one's: replaced, with the count carried", ctx do
      w0 = keg_wash!(ctx.brewer, %{repeat_count: 10})
      {:ok, _} = BreweryTasks.complete(w0, nil, ctx.brewer, @today)
      old_id = w0.series_id
      w2 = week(w0, 2)
      before = event_count()

      # Oct 28 is the 4th Wednesday, so the first new date is Nov 4.
      assert {:ok, first} =
               BreweryTasks.update(
                 w2,
                 %{
                   repeat: "monthly",
                   repeat_month_rule: "weekday",
                   repeat_week_of_month: 1,
                   repeat_weekday: 3
                 },
                 ctx.brewer,
                 scope: "following",
                 today: @today
               )

      # 2 dates before the split, so 8 are left.
      assert Enum.map(series_tasks(first.series_id), & &1.due_on) == [
               ~D[2026-11-04],
               ~D[2026-12-02],
               ~D[2027-01-06],
               ~D[2027-02-03],
               ~D[2027-03-03],
               ~D[2027-04-07],
               ~D[2027-05-05],
               ~D[2027-06-02]
             ]

      new = Repo.get!(TaskSeries, first.series_id)
      assert {new.start_date, new.count, new.frequency} == {~D[2026-10-28], 8, "monthly"}

      old = Repo.get!(TaskSeries, old_id)
      assert {old.until_date, old.count} == {~D[2026-10-27], nil}

      # Earlier and finished occurrences stay in the old series, unchanged.
      assert Enum.map(series_tasks(old_id), & &1.due_on) == [~D[2026-10-14], ~D[2026-10-21]]
      assert reload(w0).completed_at
      refute reload(w2)

      assert event_count() == before + 1
      assert [%Event{task_id: id, detail: detail}] = events("edited")
      assert id == first.id
      assert detail["replaced_task_id"] == w2.id
      assert detail["removed"] == 7
      assert detail["repeat"]["from"]["frequency"] == "weekly"
      assert detail["repeat"]["to"]["week_of_month"] == 1
    end

    test "the new rule gives this date: the occurrence is reused and keeps its History", ctx do
      w0 = keg_wash!(ctx.brewer)
      w2 = week(w0, 2)
      {:ok, _} = BreweryTasks.update(w2, %{notes: "Own"}, ctx.brewer, scope: "this")

      # Oct 28 is the last Wednesday of October.
      assert {:ok, reused} =
               BreweryTasks.update(
                 w2,
                 %{
                   title: "Monthly wash",
                   repeat: "monthly",
                   repeat_month_rule: "weekday",
                   repeat_week_of_month: -1,
                   repeat_weekday: 3
                 },
                 ctx.brewer,
                 scope: "following",
                 today: @today
               )

      assert reused.id == w2.id
      assert reused.series_id != w0.series_id

      assert {reused.series_date, reused.title, reused.notes} ==
               {~D[2026-10-28], "Monthly wash", "Own"}

      refute reused.series_exception

      assert Enum.take(Enum.map(series_tasks(reused.series_id), & &1.due_on), 3) ==
               [~D[2026-10-28], ~D[2026-11-25], ~D[2026-12-30]]

      assert Enum.all?(series_tasks(reused.series_id), &(&1.title == "Monthly wash"))
      assert Enum.map(BreweryTasks.list_events(w2.id).events, & &1.action) == ["edited", "edited"]
    end

    test "the first date of the series: the old series is deleted", ctx do
      w0 = keg_wash!(ctx.brewer)
      old_id = w0.series_id

      assert {:ok, reused} =
               BreweryTasks.update(w0, %{repeat: "weekly", repeat_weekdays: [3, 5]}, ctx.brewer,
                 scope: "following",
                 today: @today
               )

      assert reused.id == w0.id
      refute Repo.get(TaskSeries, old_id)

      assert Enum.take(Enum.map(series_tasks(reused.series_id), & &1.due_on), 3) ==
               [~D[2026-10-14], ~D[2026-10-16], ~D[2026-10-21]]
    end

    test "changed: :keep keeps the later exceptions; :remove removes them", ctx do
      for {changed, kept?} <- [keep: true, remove: false] do
        Repo.delete_all(Task)
        Repo.delete_all(TaskSeries)
        w0 = keg_wash!(ctx.brewer)
        {:ok, moved} = BreweryTasks.move(week(w0, 5), ~D[2026-11-19], nil, ctx.brewer)

        {:ok, _} =
          BreweryTasks.update(week(w0, 2), %{repeat: "weekly", repeat_weekdays: [4]}, ctx.brewer,
            scope: "following",
            changed: changed,
            today: @today
          )

        assert reload(moved) != nil == kept?
        assert List.last(events("edited")).detail["kept"] == if(kept?, do: 1, else: 0)
      end
    end

    test "with keep, a kept occurrence's day gets no second task (just this one)", ctx do
      w0 = keg_wash!(ctx.brewer)
      {:ok, _} = BreweryTasks.update(week(w0, 5), %{title: "Own"}, ctx.brewer, scope: "this")

      {:ok, first} =
        BreweryTasks.update(week(w0, 2), %{repeat_weekdays: [3, 5]}, ctx.brewer,
          scope: "following",
          today: @today
        )

      nov18 = ~D[2026-11-18]

      assert [%Task{title: "Own", series_id: old}] =
               Repo.all(from t in Task, where: t.due_on == ^nov18)

      assert old == w0.series_id
      assert nov18 in Repo.get!(TaskSeries, first.series_id).skipped_dates

      # The Fridays are new, and the other Wednesdays are the new series'.
      for day <- [~D[2026-10-30], ~D[2026-11-20], ~D[2026-11-25]] do
        assert [%Task{series_id: id}] = Repo.all(from t in Task, where: t.due_on == ^day)
        assert id == first.series_id
      end

      # A top-up never fills it either.
      assert {:ok, _} = Series.top_up(Date.add(@today, 30))
      assert length(Repo.all(from t in Task, where: t.due_on == ^nov18)) == 1
    end

    test "with keep, a kept occurrence moved onto a day the new rule makes gets no second", ctx do
      w0 = keg_wash!(ctx.brewer)
      nov20 = ~D[2026-11-20]
      {:ok, moved} = BreweryTasks.move(week(w0, 5), nov20, nil, ctx.brewer)

      {:ok, first} =
        BreweryTasks.update(week(w0, 2), %{repeat_weekdays: [3, 5]}, ctx.brewer,
          scope: "following",
          today: @today
        )

      assert [%Task{id: id}] = Repo.all(from t in Task, where: t.due_on == ^nov20)
      assert id == moved.id

      # Its old Wednesday is free, so the new series makes one there.
      assert [%Task{series_id: sid}] =
               Repo.all(from t in Task, where: t.due_on == ^~D[2026-11-18])

      assert sid == first.series_id
    end

    test "a count already used up is refused", ctx do
      w0 = keg_wash!(ctx.brewer, %{repeat_count: 10})

      assert {:error, %Ecto.Changeset{} = cs} =
               BreweryTasks.update(week(w0, 3), %{repeat_count: 3}, ctx.brewer,
                 scope: "following",
                 today: @today
               )

      assert Keyword.has_key?(cs.errors, :count)
      assert length(series_tasks(w0.series_id)) == 10
    end

    test "Repeat set to never is refused (Stop repeating does that)", ctx do
      w1 = keg_wash!(ctx.brewer) |> week(1)

      assert {:error, %Ecto.Changeset{} = cs} =
               BreweryTasks.update(w1, %{repeat: "never"}, ctx.brewer, scope: "following")

      assert Keyword.has_key?(cs.errors, :repeat)
    end

    test "an invalid new rule is refused and nothing changes", ctx do
      w0 = keg_wash!(ctx.brewer)

      assert {:error, %Ecto.Changeset{}} =
               BreweryTasks.update(week(w0, 2), %{repeat_weekdays: []}, ctx.brewer,
                 scope: "following"
               )

      assert length(series_tasks(w0.series_id)) == 53
      assert series(w0).until_date == nil
    end
  end

  describe "stop repeating (S63)" do
    test "preview counts, then stop", ctx do
      w0 = keg_wash!(ctx.brewer)
      {:ok, _} = BreweryTasks.move(week(w0, 10), ~D[2026-12-24], nil, ctx.brewer)
      {:ok, _} = BreweryTasks.complete(week(w0, 11), "planned_day", ctx.brewer, @today)

      w1 = week(w0, 1)
      assert Series.preview(w1) == %{later_open: 49, later_changed: 1}

      before = event_count()
      assert {:ok, stopped} = Series.stop(w1, ctx.brewer)
      assert stopped.id == w1.id
      assert event_count() == before + 1

      assert [%Event{task_id: id, detail: detail}] = events("stopped_repeating")
      assert id == w1.id
      assert {detail["removed"], detail["kept"]} == {49, 1}

      assert {series(w0).until_date, series(w0).count} == {~D[2026-10-21], nil}

      # w0, w1, the kept exception and the finished one.
      assert length(series_tasks(w0.series_id)) == 4
      assert Series.preview(w1) == %{later_open: 0, later_changed: 1}
      assert {:ok, 0} = Series.top_up(Date.add(@today, 60))
    end

    test "changed: :remove removes the later exceptions too", ctx do
      w0 = keg_wash!(ctx.brewer)
      {:ok, _} = BreweryTasks.move(week(w0, 10), ~D[2026-12-24], nil, ctx.brewer)

      assert {:ok, _} = Series.stop(w0, ctx.brewer, changed: :remove)
      assert [%Event{detail: %{"removed" => 52, "kept" => 0}}] = events("stopped_repeating")
      assert length(series_tasks(w0.series_id)) == 1
    end

    test "a one-off can't be stopped", ctx do
      {:ok, task} = BreweryTasks.create(%{title: "One-off", due_on: @today}, ctx.brewer)
      assert {:error, :not_in_series} = Series.stop(task, ctx.brewer)
    end
  end

  describe "delete \"following\"" do
    test "removes this and later open ones, ends the series the day before, logs once", ctx do
      w0 = keg_wash!(ctx.brewer)
      {:ok, _} = BreweryTasks.complete(week(w0, 6), "planned_day", ctx.brewer, @today)
      {:ok, moved} = BreweryTasks.move(week(w0, 8), ~D[2026-12-10], nil, ctx.brewer)
      w3 = week(w0, 3)
      before = event_count()

      assert {:ok, :deleted} = BreweryTasks.delete(w3, ctx.brewer, scope: "following")

      assert event_count() == before + 1
      assert [%Event{task_id: id, detail: detail}] = events("deleted")
      assert id == w3.id
      assert %{"scope" => "following", "removed" => 47, "kept" => 1} = detail

      assert series(w0).until_date == ~D[2026-11-03]

      assert Enum.map(series_tasks(w0.series_id), & &1.series_date) ==
               [~D[2026-10-14], ~D[2026-10-21], ~D[2026-10-28], ~D[2026-11-25], ~D[2026-12-09]]

      assert reload(moved)
      assert {:ok, 0} = Series.top_up(Date.add(@today, 60))
    end

    test "changed: :remove, from the first date, deletes the series", ctx do
      w0 = keg_wash!(ctx.brewer)
      {:ok, _} = BreweryTasks.move(week(w0, 8), ~D[2026-12-10], nil, ctx.brewer)

      assert {:ok, :deleted} =
               BreweryTasks.delete(w0, ctx.brewer, scope: "following", changed: :remove)

      assert Repo.aggregate(Task, :count) == 0
      assert Repo.aggregate(TaskSeries, :count) == 0
    end

    test "from the first date when the start is earlier, deletes the series", ctx do
      # Started on Wednesday Oct 14; the first last-Friday is Oct 30.
      {:ok, first} =
        BreweryTasks.create(
          %{
            title: "Glycol",
            due_on: @today,
            repeat: "monthly",
            repeat_month_rule: "weekday",
            repeat_week_of_month: -1,
            repeat_weekday: 5
          },
          ctx.brewer,
          @today
        )

      assert first.due_on == ~D[2026-10-30]
      assert {:ok, :deleted} = BreweryTasks.delete(first, ctx.brewer, scope: "following")
      assert Repo.aggregate(TaskSeries, :count) == 0
      assert Repo.aggregate(Task, :count) == 0
    end

    test "days close up after the removal", ctx do
      {:ok, a} = BreweryTasks.create(%{title: "A", due_on: Date.add(@today, 7)}, ctx.brewer)
      w0 = keg_wash!(ctx.brewer)
      {:ok, b} = BreweryTasks.create(%{title: "B", due_on: Date.add(@today, 7)}, ctx.brewer)

      assert {:ok, :deleted} = BreweryTasks.delete(w0, ctx.brewer, scope: "following")
      assert {reload(a).position, reload(b).position} == {1, 2}
    end
  end

  describe "scope" do
    test "an edit or delete of an occurrence without one is scope_required", ctx do
      w1 = keg_wash!(ctx.brewer) |> week(1)

      assert {:error, :scope_required} = BreweryTasks.update(w1, %{title: "X"}, ctx.brewer)
      assert {:error, :scope_required} = BreweryTasks.update(w1, %{repeat_count: 3}, ctx.brewer)
      assert {:error, :scope_required} = BreweryTasks.delete(w1, ctx.brewer)
      assert {:error, :scope_required} = BreweryTasks.delete(w1, ctx.brewer, scope: "all")
      assert reload(w1).title == "Keg Wash"
    end

    test "a one-off ignores the scope", ctx do
      {:ok, t} = BreweryTasks.create(%{title: "One-off", due_on: @today}, ctx.brewer)
      assert {:ok, %Task{title: "Y"}} = BreweryTasks.update(t, %{title: "Y"}, ctx.brewer)
      assert {:ok, :deleted} = BreweryTasks.delete(t, ctx.brewer)
    end
  end

  test "leaving the Brewery clears the series assignee; the top-up then assigns no one", ctx do
    w0 = keg_wash!(ctx.brewer, %{assignee_id: ctx.brewer2.id})

    assert {:ok, _} = Accounts.update_user(ctx.brewer2, %{"active" => false}, owner_fixture())

    assert series(w0).assignee_id == nil
    assert week(w0, 1).assignee_id == nil
    assert {:ok, 1} = Series.top_up(Date.add(@today, 7))
    assert week(w0, 53).assignee_id == nil
  end

  describe "making a one-off repeat (Decision 6)" do
    test "it becomes the first occurrence, in its place; the later ones are made as on create; one History entry",
         ctx do
      {:ok, one_off} = BreweryTasks.create(%{title: "Keg Wash", due_on: @today}, ctx.brewer)
      {:ok, _below} = BreweryTasks.create(%{title: "Other", due_on: @today}, ctx.brewer)
      created = keg_wash!(ctx.brewer, %{title: "Created repeating"})
      events = event_count()

      assert {:ok, first} =
               BreweryTasks.update(
                 one_off,
                 %{"title" => "Keg Wash FV1", "repeat" => "weekly", "repeat_weekdays" => [3]},
                 ctx.brewer,
                 today: @today
               )

      assert {first.id, first.series_date, first.due_on, first.position, first.series_exception} ==
               {one_off.id, @today, @today, 1, false}

      assert first.title == "Keg Wash FV1"
      assert series(first).title == "Keg Wash FV1"
      assert week(first, 1).title == "Keg Wash FV1"
      assert length(series_tasks(first.series_id)) == length(series_tasks(created.series_id))

      assert event_count() == events + 1
      assert [%Event{task_id: id, detail: detail}] = events("made_repeating")
      assert id == one_off.id

      assert detail == %{
               "due_on" => "2026-10-14",
               "repeat" => %{"frequency" => "weekly", "interval" => 1, "weekdays" => [3]},
               "from" => %{"title" => "Keg Wash"},
               "to" => %{"title" => "Keg Wash FV1"}
             }
    end

    test "a rule whose first date is later moves it there, at the bottom", ctx do
      {:ok, one_off} = BreweryTasks.create(%{title: "Keg Wash", due_on: @today}, ctx.brewer)
      {:ok, below} = BreweryTasks.create(%{title: "Other", due_on: @today}, ctx.brewer)
      {:ok, _} = BreweryTasks.create(%{title: "Thursday", due_on: ~D[2026-10-15]}, ctx.brewer)

      assert {:ok, first} =
               BreweryTasks.update(
                 one_off,
                 %{"repeat" => "weekly", "repeat_weekdays" => [4]},
                 ctx.brewer,
                 today: @today
               )

      assert {first.due_on, first.series_date, first.position} ==
               {~D[2026-10-15], ~D[2026-10-15], 2}

      assert reload(below).position == 1
      assert length(events("made_repeating")) == 1
      assert events("moved") == []
    end

    test "a Future task needs a day; with one in the same save it repeats from there", ctx do
      {:ok, future} = BreweryTasks.create(%{title: "Keg Wash", due_on: nil}, ctx.brewer)
      repeat = %{"repeat" => "weekly", "repeat_weekdays" => [3]}

      assert {:error, :repeat_needs_day} =
               BreweryTasks.update(future, repeat, ctx.brewer, today: @today)

      assert {:error, :repeat_needs_day} =
               BreweryTasks.update(future, Map.put(repeat, "due_on", nil), ctx.brewer,
                 today: @today
               )

      assert Repo.aggregate(TaskSeries, :count) == 0
      assert events("made_repeating") == []

      assert {:ok, first} =
               BreweryTasks.update(future, Map.put(repeat, "due_on", "2026-10-21"), ctx.brewer,
                 today: @today
               )

      assert {first.id, first.due_on} == {future.id, ~D[2026-10-21]}
    end

    test "a finished one-off is refused; Never is a plain edit", ctx do
      {:ok, task} = BreweryTasks.create(%{title: "Keg Wash", due_on: @today}, ctx.brewer)
      {:ok, done} = BreweryTasks.complete(task, nil, ctx.brewer, @today)
      repeat = %{"repeat" => "weekly", "repeat_weekdays" => [3]}

      assert {:error, :repeat_finished} =
               BreweryTasks.update(done, repeat, ctx.brewer, today: @today)

      {:ok, open} = BreweryTasks.create(%{title: "Open", due_on: @today}, ctx.brewer)

      assert {:ok, %Task{series_id: nil, title: "Renamed"}} =
               BreweryTasks.update(open, %{"title" => "Renamed", "repeat" => "never"}, ctx.brewer,
                 today: @today
               )

      assert Repo.aggregate(TaskSeries, :count) == 0
    end
  end

  describe "the chain: \"following\" from before a split (G1)" do
    @monthly_first_wed %{
      repeat: "monthly",
      repeat_interval: 1,
      repeat_month_rule: "weekday",
      repeat_week_of_month: 1,
      repeat_weekday: 3
    }

    # QA's setup: weekly Wed from 10/14; 11/4 assigned to Riley "following";
    # 12/2 split to monthly on the 1st Wednesday, "following". Returns the
    # first occurrence and the split's new series id.
    defp qa_chain!(ctx, changed \\ :keep) do
      w0 = keg_wash!(ctx.brewer)
      following = [scope: "following", today: @today, changed: changed]

      {:ok, _} =
        BreweryTasks.update(week(w0, 3), %{assignee_id: ctx.brewer2.id}, ctx.brewer, following)

      {:ok, split} = BreweryTasks.update(week(w0, 7), @monthly_first_wed, ctx.brewer, following)
      {w0, split.series_id}
    end

    defp open_from(ids, date) do
      Repo.all(
        from t in Task,
          where: t.series_id in ^ids and t.series_date >= ^date and is_nil(t.completed_at),
          order_by: t.series_date
      )
    end

    test "QA repro: an assign \"following\" from 10/28 reaches 12/2, 1/6 and the rest", ctx do
      jake = user_with_role("employee", "brewery", %{name: "Jake Brewer"})
      {w0, new_id} = qa_chain!(ctx)
      assert Repo.get!(TaskSeries, new_id).continues_series_id == w0.series_id
      w2 = week(w0, 2)

      assert %{later_open: later, later_changed: 0} = Series.preview(w2)
      chain = open_from([w0.series_id, new_id], ~D[2026-10-28])
      assert later == length(chain) - 1
      assert Enum.any?(chain, &(&1.series_date == ~D[2027-01-06]))

      assert {:ok, _} =
               BreweryTasks.update(w2, %{assignee_id: jake.id}, ctx.brewer,
                 scope: "following",
                 today: @today
               )

      assert Enum.map(open_from([w0.series_id, new_id], ~D[2026-10-28]), & &1.assignee_id) ==
               List.duplicate(jake.id, length(chain))

      assert Repo.get!(TaskSeries, new_id).assignee_id == jake.id
      assert reload(w0).assignee_id == nil
      assert %Event{detail: %{"count" => count}} = List.last(events("edited"))
      assert count == length(chain)

      # The top-up makes the next monthly one for Jake.
      assert {:ok, 1} = Series.top_up(~D[2026-11-14])
      assert on(new_id, ~D[2027-11-03]).assignee_id == jake.id
    end

    test "a rule change from before a split: keep leaves the kept one in its ended series", ctx do
      {w0, new_id} = qa_chain!(ctx)
      jan = on(new_id, ~D[2027-01-06])
      {:ok, _} = BreweryTasks.update(jan, %{notes: "Own"}, ctx.brewer, scope: "this")
      w2 = week(w0, 2)
      assert %{later_changed: 1} = Series.preview(w2)

      assert {:ok, first} =
               BreweryTasks.update(w2, %{repeat_weekdays: [4]}, ctx.brewer,
                 scope: "following",
                 changed: :keep,
                 today: @today
               )

      assert first.due_on == ~D[2026-10-29]
      assert open_from([new_id], @today) == [reload(jan)]
      monthly = Repo.get!(TaskSeries, new_id)

      assert {monthly.until_date, monthly.continues_series_id} ==
               {~D[2027-01-06], first.series_id}

      assert Repo.get!(TaskSeries, first.series_id).continues_series_id == w0.series_id

      assert [%Event{detail: %{"kept" => 1, "removed" => removed}} | _] =
               Enum.reverse(events("edited"))

      assert removed > 10
      # No top-up refills the ended monthly series.
      assert {:ok, _} = Series.top_up(Date.add(@today, 60))
      assert open_from([new_id], @today) == [reload(jan)]
      # And the kept one is still reached from the start.
      assert %{later_changed: 1} = Series.preview(w0)
    end

    test "a rule change from before a split: remove deletes the emptied series", ctx do
      {w0, new_id} = qa_chain!(ctx)

      {:ok, _} =
        BreweryTasks.update(on(new_id, ~D[2027-01-06]), %{notes: "Own"}, ctx.brewer,
          scope: "this"
        )

      assert {:ok, first} =
               BreweryTasks.update(week(w0, 2), %{repeat_weekdays: [4]}, ctx.brewer,
                 scope: "following",
                 changed: :remove,
                 today: @today
               )

      refute Repo.get(TaskSeries, new_id)
      refute on(first.series_id, ~D[2027-01-06])
      assert Repo.all(from t in Task, where: t.due_on == ^~D[2027-01-06]) == []
    end

    test "delete \"following\" from before a split, keep and remove", ctx do
      {w0, new_id} = qa_chain!(ctx)
      jan = on(new_id, ~D[2027-01-06])
      {:ok, _} = BreweryTasks.update(jan, %{notes: "Own"}, ctx.brewer, scope: "this")

      assert {:ok, _} =
               BreweryTasks.delete(week(w0, 2), ctx.brewer, scope: "following", changed: :keep)

      assert open_from([w0.series_id, new_id], ~D[2026-10-28]) == [reload(jan)]
      assert Repo.get!(TaskSeries, w0.series_id).until_date == ~D[2026-10-27]
      assert Repo.get!(TaskSeries, new_id).continues_series_id == w0.series_id
      assert [%Event{detail: %{"kept" => 1}}] = events("deleted")

      assert {:ok, _} =
               BreweryTasks.delete(week(w0, 1), ctx.brewer, scope: "following", changed: :remove)

      refute Repo.get(Task, jan.id)
      refute Repo.get(TaskSeries, new_id)
    end

    test "Stop repeating from before a split, keep and remove; then it's the last", ctx do
      {w0, new_id} = qa_chain!(ctx)
      jan = on(new_id, ~D[2027-01-06])
      {:ok, _} = BreweryTasks.update(jan, %{notes: "Own"}, ctx.brewer, scope: "this")
      w2 = week(w0, 2)
      %{later_open: later} = Series.preview(w2)

      assert {:ok, _} = Series.stop(w2, ctx.brewer, changed: :keep)
      assert open_from([w0.series_id, new_id], ~D[2026-10-29]) == [reload(jan)]
      assert [%Event{detail: %{"removed" => ^later, "kept" => 1}}] = events("stopped_repeating")

      {:ok, board} = BreweryTasks.board(~D[2026-10-26], ~D[2026-10-30], @today)
      [card] = for d <- board.days, c <- d.cards, c.task.id == w2.id, do: c
      refute card.task.series_last

      assert {:ok, _} = Series.stop(w2, ctx.brewer, changed: :remove)
      refute Repo.get(TaskSeries, new_id)

      {:ok, board} = BreweryTasks.board(~D[2026-10-26], ~D[2026-10-30], @today)
      [card] = for d <- board.days, c <- d.cards, c.task.id == w2.id, do: c
      assert card.task.series_last
    end

    test "a chain of two splits: preview, an edit and Stop from the start reach both", ctx do
      w0 = keg_wash!(ctx.brewer)
      following = [scope: "following", today: @today]

      {:ok, b} =
        BreweryTasks.update(week(w0, 3), %{repeat_interval: 2}, ctx.brewer, following)

      {:ok, c} =
        BreweryTasks.update(
          on(b.series_id, ~D[2026-12-02]),
          @monthly_first_wed,
          ctx.brewer,
          following
        )

      assert Repo.get!(TaskSeries, c.series_id).continues_series_id == b.series_id
      assert Series.chain_ids(w0.series_id) == [b.series_id, c.series_id]

      ids = [w0.series_id, b.series_id, c.series_id]
      all = open_from(ids, Date.add(@today, 1))
      assert %{later_open: later} = Series.preview(w0)
      assert later == length(all)
      assert Enum.any?(all, &(&1.series_id == c.series_id))

      {:ok, _} = BreweryTasks.update(w0, %{title: "Keg Wash all"}, ctx.brewer, following)
      assert Enum.all?(open_from(ids, @today), &(&1.title == "Keg Wash all"))

      assert {:ok, _} = Series.stop(w0, ctx.brewer)
      assert open_from(ids, Date.add(@today, 1)) == []
      refute Repo.get(TaskSeries, b.series_id)
      refute Repo.get(TaskSeries, c.series_id)
    end
  end
end
