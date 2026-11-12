defmodule RockcutApi.Tasks.QaFollowupsTest do
  @moduledoc """
  D53 Part 2 stage 7 (spec §4.8): the task-board follow-ups from Part 1's DEV
  QA, each from its repro in `stepwise_results/d53_part1_dev_qa*`:

    * gap 4: History on a "following" edit says who really came off later
      occurrences;
    * gap 5: leaving a department is one History row per series, with a count;
    * gap 6: Mark not done doesn't put a former member back on the task;
    * gap 9: deactivation is logged as such, not as leaving;
    * gap 13: a rule change from a series' first occurrence, with keep, moves
      the kept ones into the new series instead of cutting them loose;
    * gap 14: a kept occurrence moved off its day: the confirm counts it
      (`keeps_moved`), and since D58 (§3.5, 5202) it stands in for its old
      day, which the new pattern doesn't make again;
    * recheck 2, observation 1: the rule-change confirm and History count the
      removed occurrences that held their own notes.

  Gap 11 (crushed card titles) and observation 2 (`count:` in the Ends
  error) are the UI's: `src/lib/tasks.test.ts` and the Playwright follow-up
  spec.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  import RockcutApi.TaskFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Tasks}
  alias RockcutApi.Tasks.{Assignees, Event, Series, Task, TaskSeries}

  # A Wednesday. "Keg Wash" every Wed from here.
  @today ~D[2026-10-14]

  setup do
    department_fixture("brewery", "Brewery")
    department_fixture("bar", "Taproom")

    mgr = user_with_role("manager", "brewery", %{name: "Kate Kettle"})
    jake = user_with_role("employee", "brewery", %{name: "Jake Brewer"})
    riley = user_with_role("employee", "brewery", %{name: "Riley Wort"})
    morgan = user_with_role("employee", "brewery", %{name: "Morgan Mash"})
    jordan = user_with_role("employee", "brewery", %{name: "Jordan Float"})

    %{
      mgr: mgr,
      jake: jake,
      riley: riley,
      morgan: morgan,
      jordan: jordan,
      board: brewery_board()
    }
  end

  defp keg_wash!(ctx, attrs) do
    {:ok, first} =
      Tasks.create(
        ctx.board,
        Map.merge(
          %{title: "Keg Wash", due_on: @today, repeat: "weekly", repeat_weekdays: [3]},
          attrs
        ),
        ctx.mgr,
        @today
      )

    first
  end

  defp week(%Task{series_id: id}, n),
    do: Repo.get_by(Task, series_id: id, series_date: Date.add(@today, 7 * n))

  defp ids(%Task{id: id}), do: Assignees.ids(%Task{id: id})

  defp following!(ctx, task, attrs, opts \\ []) do
    {:ok, updated} =
      Tasks.update(
        ctx.board,
        task,
        attrs,
        ctx.mgr,
        Keyword.merge([scope: "following", today: @today], opts)
      )

    updated
  end

  defp unassigned_events,
    do: Repo.all(from e in Event, where: e.action == "unassigned", order_by: e.id)

  describe "gap 4: History on a following edit" do
    test "names everyone taken off later occurrences, not only the edited one's people", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.jake.id, ctx.riley.id]})
      # From week 3 on: Morgan and Jordan.
      following!(ctx, week(first, 3), %{assignee_ids: [ctx.morgan.id, ctx.jordan.id]})
      # From week 1 on: Riley only. Weeks 1–2 lose Jake; weeks 3+ lose Morgan and Jordan.
      following!(ctx, week(first, 1), %{assignee_ids: [ctx.riley.id]})

      assert ids(week(first, 1)) == [ctx.riley.id]
      assert ids(week(first, 5)) == [ctx.riley.id]

      event =
        Repo.one(
          from e in Event,
            where: e.task_id == ^week(first, 1).id,
            order_by: [desc: e.id],
            limit: 1
        )

      assert event.action == "edited"

      assert Enum.sort(event.detail["people"]["removed"]) ==
               Enum.sort([ctx.jake.id, ctx.morgan.id, ctx.jordan.id])

      # Riley wasn't on weeks 3 and later: she was put on them.
      assert event.detail["people"]["added"] == [ctx.riley.id]
      # The edited occurrence's own change stays as it was.
      assert event.detail["from"]["assignee_ids"] == [ctx.jake.id, ctx.riley.id]
    end

    test "names its people in History's names map", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.jake.id]})
      following!(ctx, week(first, 2), %{assignee_ids: [ctx.morgan.id]})
      following!(ctx, week(first, 1), %{assignee_ids: [ctx.riley.id]})

      # Only the newest page entry: the edit from week 1, which alone names Morgan in `people`.
      [latest] =
        Repo.all(from e in Event, where: e.action == "edited", order_by: [desc: e.id], limit: 1)

      Repo.delete_all(from e in Event, where: e.id != ^latest.id)

      %{names: names} = Tasks.list_events(ctx.board)
      assert names.users[ctx.morgan.id] == "Morgan Mash"
    end
  end

  describe "gap 5 and gap 9: leaving and deactivation in History" do
    setup ctx do
      floater =
        add_membership(
          user_with_role("employee", "bar", %{name: "Lee Leaver"}),
          "brewery",
          "employee"
        )

      Map.put(ctx, :floater, floater)
    end

    test "one row per series with its count; one-offs keep theirs", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.floater.id, ctx.jake.id]})

      {:ok, solo} =
        Tasks.create(
          ctx.board,
          %{title: "Carb FV3", due_on: @today, assignee_ids: [ctx.floater.id]},
          ctx.mgr
        )

      open = Repo.aggregate(from(t in Task, where: t.series_id == ^first.series_id), :count)
      assert open > 50

      assert {:ok, _} = Accounts.set_memberships(ctx.floater, [], ctx.mgr)

      assert ids(week(first, 10)) == [ctx.jake.id]
      events = unassigned_events()
      assert length(events) == 2

      series_event = Enum.find(events, &(&1.task_id == first.id))

      assert series_event.detail == %{
               "from" => [ctx.floater.id],
               "to" => [],
               "reason" => "left_brewery",
               "count" => open
             }

      solo_event = Enum.find(events, &(&1.task_id == solo.id))
      assert solo_event.detail["reason"] == "left_brewery"
      refute Map.has_key?(solo_event.detail, "count")
    end

    test "deactivation is logged as deactivated", ctx do
      {:ok, task} =
        Tasks.create(
          ctx.board,
          %{title: "Carb FV3", due_on: @today, assignee_ids: [ctx.floater.id]},
          ctx.mgr
        )

      owner = user_fixture(%{is_owner: true})

      owner =
        Repo.update!(Ecto.Changeset.change(owner, is_owner: true))
        |> then(&Accounts.get_user!(&1.id))

      assert {:ok, _} = Accounts.update_user(ctx.floater, %{"active" => false}, owner)

      assert ids(task) == []
      assert [%Event{detail: %{"reason" => "deactivated"}}] = unassigned_events()
    end
  end

  describe "gap 6: Mark not done" do
    test "doesn't put someone who left back on the reopened task", ctx do
      floater =
        add_membership(
          user_with_role("employee", "bar", %{name: "Lee Leaver"}),
          "brewery",
          "employee"
        )

      {:ok, task} =
        Tasks.create(
          ctx.board,
          %{title: "Carb FV3", due_on: @today, assignee_ids: [floater.id, ctx.jake.id]},
          ctx.mgr
        )

      {:ok, _} = Tasks.complete(ctx.board, task, "planned_day", ctx.mgr, @today)
      assert {:ok, _} = Accounts.set_memberships(floater, [], ctx.mgr)
      # A finished task keeps who did it.
      assert ids(task) == [floater.id, ctx.jake.id]

      {:ok, reopened} = Tasks.uncomplete(ctx.board, Repo.get!(Task, task.id), ctx.mgr)

      assert ids(reopened) == [ctx.jake.id]
      assert Repo.get!(Task, task.id).assignee_id == ctx.jake.id

      assert [%Event{detail: %{"from" => [_, _], "to" => [jake], "reason" => "left_brewery"}}] =
               unassigned_events()

      assert jake == ctx.jake.id
    end

    test "a reopened task whose people are all still members keeps them, with no extra History",
         ctx do
      {:ok, task} =
        Tasks.create(
          ctx.board,
          %{title: "Carb FV3", due_on: @today, assignee_ids: [ctx.jake.id]},
          ctx.mgr
        )

      {:ok, _} = Tasks.complete(ctx.board, task, "planned_day", ctx.mgr, @today)
      {:ok, reopened} = Tasks.uncomplete(ctx.board, Repo.get!(Task, task.id), ctx.mgr)
      assert ids(reopened) == [ctx.jake.id]
      assert unassigned_events() == []
    end
  end

  describe "gap 13: a rule change from the first occurrence, with keep" do
    test "the kept exception joins the new series, flag and people intact, and series actions reach it",
         ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.jake.id, ctx.riley.id]})
      w1 = week(first, 1)

      {:ok, _} =
        Tasks.update(ctx.board, w1, %{assignee_ids: [ctx.morgan.id]}, ctx.mgr,
          scope: "this",
          today: @today
        )

      # From the first occurrence: Tuesdays too.
      new_first = following!(ctx, first, %{repeat_weekdays: [2, 3]}, changed: :keep)

      kept = Repo.get!(Task, w1.id)
      assert kept.series_id == new_first.series_id
      assert kept.series_exception
      assert ids(kept) == [ctx.morgan.id]
      # The new series doesn't make a second one on its day.
      assert Repo.aggregate(from(t in Task, where: t.due_on == ^w1.due_on), :count) == 1

      # A following edit leaves it alone; Delete following from the first reaches it.
      following!(ctx, new_first, %{assignee_ids: [ctx.jordan.id]})
      assert ids(Repo.get!(Task, w1.id)) == [ctx.morgan.id]

      {:ok, _} =
        Tasks.delete(ctx.board, Repo.get!(Task, new_first.id), ctx.mgr,
          scope: "following",
          changed: :remove
        )

      refute Repo.get(Task, w1.id)
    end

    test "a finished one there joins too", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.jake.id]})
      w1 = week(first, 1)
      {:ok, _} = Tasks.complete(ctx.board, w1, "planned_day", ctx.mgr, w1.due_on)

      new_first = following!(ctx, first, %{repeat_weekdays: [2, 3]}, changed: :keep)

      done = Repo.get!(Task, w1.id)
      assert done.series_id == new_first.series_id
      assert Task.done?(done)
      assert Repo.get(TaskSeries, first.series_id) == nil
    end
  end

  describe "gap 14: a kept occurrence moved off its day" do
    test "the confirm counts it", ctx do
      first = keg_wash!(ctx, %{})
      w5 = week(first, 5)
      {:ok, _} = Tasks.move(ctx.board, w5, Date.add(w5.due_on, 1), nil, ctx.mgr)

      assert {:ok, %{kind: "rule", keeps_moved: 1}} =
               Series.change_preview(week(first, 2), %{"repeat_weekdays" => [3, 5]})

      # Not moved: nothing to say.
      assert {:ok, %{keeps_moved: 0}} =
               Series.change_preview(week(first, 6), %{"repeat_weekdays" => [3, 5]})
    end
  end

  describe "D58 §3.5 (5202): no twin for a kept occurrence moved off its day" do
    defp on_day(%Task{series_id: id}, day) do
      chain = [id | Series.chain_ids(id)]
      Repo.all(from t in Task, where: t.series_id in ^chain and t.due_on == ^day)
    end

    # The QA repro: Mon/Wed/Fri from Mon 11/2, Fri 11/20 moved to Sat 11/21,
    # then 11/2 changed to every other week, Mon/Fri, keeping the changed one.
    test "a split from the first date doesn't remake the moved one's old day", ctx do
      first = keg_wash!(ctx, %{due_on: ~D[2026-11-02], repeat_weekdays: [1, 3, 5]})
      fri = Repo.get_by!(Task, series_id: first.series_id, series_date: ~D[2026-11-20])
      {:ok, _} = Tasks.move(ctx.board, fri, ~D[2026-11-21], nil, ctx.mgr)

      new_first =
        following!(ctx, first, %{repeat_interval: 2, repeat_weekdays: [1, 5]}, changed: :keep)

      assert on_day(new_first, ~D[2026-11-20]) == []
      assert [moved] = on_day(new_first, ~D[2026-11-21])
      assert moved.id == fri.id
      # The pattern still makes the other dates of that week, and the next.
      assert [_] = on_day(new_first, ~D[2026-11-16])
      assert [_] = on_day(new_first, ~D[2026-11-30])
      assert [_] = on_day(new_first, ~D[2026-12-04])

      # A top-up doesn't bring it back either.
      Series.top_up(~D[2026-11-25])
      assert on_day(new_first, ~D[2026-11-20]) == []
    end

    test "a split later in the series doesn't either", ctx do
      first = keg_wash!(ctx, %{})
      w5 = week(first, 5)
      {:ok, _} = Tasks.move(ctx.board, w5, Date.add(w5.due_on, 1), nil, ctx.mgr)

      following!(ctx, week(first, 2), %{repeat_weekdays: [3, 5]}, changed: :keep)

      # The moved one stays in the old part; `first` sees the whole chain.
      assert on_day(first, w5.series_date) == []
      assert [moved] = on_day(first, Date.add(w5.series_date, 1))
      assert moved.id == w5.id
      assert [_] = on_day(first, Date.add(w5.series_date, 2))
      assert [_] = on_day(first, Date.add(w5.series_date, 7))
    end
  end

  describe "recheck 2, observation 1: notes on removed dates" do
    test "the confirm and History count the removed occurrences with their own notes", ctx do
      first = keg_wash!(ctx, %{})
      # Notes on a Wednesday the new pattern drops, just this one (not an exception).
      w3 = week(first, 3)

      {:ok, _} =
        Tasks.update(ctx.board, w3, %{notes: "Bring the new hose"}, ctx.mgr,
          scope: "this",
          today: @today
        )

      refute Repo.get!(Task, w3.id).series_exception

      assert {:ok, %{kind: "rule", removes_noted: 1}} =
               Series.change_preview(week(first, 1), %{"repeat_weekdays" => [5]})

      following!(ctx, week(first, 1), %{repeat_weekdays: [5]}, changed: :keep)

      refute Repo.get(Task, w3.id)

      event =
        Repo.one(from e in Event, where: e.action == "edited", order_by: [desc: e.id], limit: 1)

      assert event.detail["removed_with_notes"] == 1
    end

    test "nothing to say when no removed one had its own notes", ctx do
      first = keg_wash!(ctx, %{})

      assert {:ok, %{removes_noted: 0}} =
               Series.change_preview(week(first, 1), %{"repeat_weekdays" => [5]})

      following!(ctx, week(first, 1), %{repeat_weekdays: [5]}, changed: :keep)

      event =
        Repo.one(from e in Event, where: e.action == "edited", order_by: [desc: e.id], limit: 1)

      refute Map.has_key?(event.detail, "removed_with_notes")
    end
  end
end
