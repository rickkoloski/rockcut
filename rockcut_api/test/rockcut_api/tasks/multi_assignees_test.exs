defmodule RockcutApi.Tasks.MultiAssigneesTest do
  @moduledoc """
  D53 Part 1 (§3, S216–S221), the `Tasks` context: several people on a task or
  series, `assignee_id` always equal to the first, and every path that used
  the one assignee.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  import RockcutApi.TaskFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Accounts, Tasks}
  alias RockcutApi.Tasks.{Assignees, Event, Series, Task, TaskSeries}

  # A Wednesday.
  @today ~D[2026-10-14]

  setup do
    department_fixture("brewery", "Brewery")
    department_fixture("bar", "Taproom")

    mgr = user_with_role("manager", "brewery", %{name: "Kate Kettle"})
    a = user_with_role("employee", "brewery", %{name: "Riley Wort"})
    b = user_with_role("employee", "brewery", %{name: "Jordan Float"})
    c = user_with_role("employee", "brewery", %{name: "Sam Mash"})
    %{mgr: mgr, a: a, b: b, c: c, board: brewery_board()}
  end

  defp ids(%Task{id: id}), do: Assignees.ids(%Task{id: id})
  defp ids(%TaskSeries{id: id}), do: Assignees.ids(%TaskSeries{id: id})

  # The join rows and the compatibility copy agree: the invariant of §3.1.
  defp assert_in_step(record) do
    record = Repo.get!(record.__struct__, record.id)
    assert record.assignee_id == List.first(ids(record))
    record
  end

  defp add!(ctx, attrs \\ %{}) do
    {:ok, task} =
      Tasks.create(ctx.board, Map.merge(%{title: "Carb FV3", due_on: @today}, attrs), ctx.mgr)

    task
  end

  defp keg_wash!(ctx, attrs \\ %{}) do
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

  defp series_of(%Task{series_id: id}), do: Repo.get!(TaskSeries, id)

  defp reload!(%Task{id: id}), do: Repo.get!(Task, id)

  defp events(%Task{id: id}, action),
    do: Repo.all(from e in Event, where: e.task_id == ^id and e.action == ^action, order_by: e.id)

  describe "QA gaps 1 and 2: a rule change never changes people on a date that survives" do
    # A Saturday. Mon/Wed/Fri from Mon Nov 9, as in the QA report.
    @sat ~D[2026-11-07]
    @mwf [1, 3, 5]
    @add_tue [1, 2, 3, 5]

    defp mwf!(ctx, attrs) do
      {:ok, first} =
        Tasks.create(
          ctx.board,
          Map.merge(
            %{title: "Keg Wash", due_on: ~D[2026-11-09], repeat: "weekly", repeat_weekdays: @mwf},
            attrs
          ),
          ctx.mgr,
          @sat
        )

      first
    end

    # What's on the board that day (there's one).
    defp on(day) do
      [task] = Repo.all(from t in Task, where: t.due_on == ^day)
      assert_in_step(task)
    end

    defp people_on(day), do: ids(on(day))

    defp this!(ctx, day, attrs) do
      {:ok, t} = Tasks.update(ctx.board, on(day), attrs, ctx.mgr, scope: "this", today: @sat)
      t
    end

    defp following!(ctx, day, attrs, opts \\ []) do
      {:ok, t} =
        Tasks.update(
          ctx.board,
          on(day),
          attrs,
          ctx.mgr,
          opts ++ [scope: "following", today: @sat, changed: :keep]
        )

      t
    end

    # Riley and Jordan, then Sam from 11/16, then Kate from 11/23.
    defp changed_over_time!(ctx) do
      first = mwf!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      following!(ctx, ~D[2026-11-16], %{assignee_ids: [ctx.c.id]})
      following!(ctx, ~D[2026-11-23], %{assignee_ids: [ctx.mgr.id]})
      first
    end

    test "gap 1 repro: rule-only from before the latest change keeps each date's people", ctx do
      changed_over_time!(ctx)

      assert %{later_open: later} =
               Series.preview(on(~D[2026-11-18]))

      new = following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue})

      # Dates that survive, on either side of the latest change.
      assert people_on(~D[2026-11-13]) == [ctx.a.id, ctx.b.id]
      assert people_on(~D[2026-11-16]) == [ctx.c.id]
      assert people_on(~D[2026-11-18]) == [ctx.c.id]
      assert people_on(~D[2026-11-20]) == [ctx.c.id]
      assert people_on(~D[2026-11-23]) == [ctx.mgr.id]
      assert people_on(~D[2026-11-25]) == [ctx.mgr.id]

      # Dates it adds take the one before.
      assert people_on(~D[2026-11-24]) == [ctx.mgr.id]
      assert on(~D[2026-11-24]).series_id == new.series_id
      refute on(~D[2026-11-24]).series_exception

      # History is the rule change, and no people change.
      assert [event] = events(new, "edited") |> Enum.filter(& &1.detail["repeat"])
      assert event.detail["removed"] == later
      refute Map.has_key?(event.detail, "from")

      # The series' own list goes on from the latest people.
      assert ids(%TaskSeries{id: new.series_id}) == [ctx.mgr.id]
      assert {:ok, added} = Series.top_up(Date.add(@sat, 14))
      assert added > 0
      assert people_on(Date.add(@sat, 366)) == [ctx.mgr.id]
    end

    test "gap 1 repro: a new date inside the earlier people's stretch takes theirs", ctx do
      changed_over_time!(ctx)
      following!(ctx, ~D[2026-11-16], %{repeat_weekdays: @add_tue})

      assert people_on(~D[2026-11-17]) == [ctx.c.id]
      assert people_on(~D[2026-11-24]) == [ctx.mgr.id]
    end

    test "gap 1, API version: the split before the change keeps the first people", ctx do
      mwf!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      following!(ctx, ~D[2026-11-16], %{assignee_ids: [ctx.c.id]})

      following!(ctx, ~D[2026-11-11], %{repeat_weekdays: @add_tue})

      assert people_on(~D[2026-11-13]) == [ctx.a.id, ctx.b.id]
      assert people_on(~D[2026-11-16]) == [ctx.c.id]
      assert people_on(~D[2026-11-17]) == [ctx.c.id]
    end

    test "a date the rule drops still passes its people on to the next new date", ctx do
      changed_over_time!(ctx)

      # Tue/Thu from Wed 11/18: 11/18 itself isn't kept, and nothing survives.
      new = following!(ctx, ~D[2026-11-18], %{repeat_weekdays: [2, 4]})

      assert new.series_date == ~D[2026-11-19]
      assert people_on(~D[2026-11-19]) == [ctx.c.id]
      assert people_on(~D[2026-11-24]) == [ctx.mgr.id]
    end

    test "changing people with the rule reaches them all, but not those kept", ctx do
      changed_over_time!(ctx)
      this!(ctx, ~D[2026-11-25], %{assignee_ids: [ctx.a.id]})

      new =
        following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue, assignee_ids: [ctx.b.id]})

      assert people_on(~D[2026-11-18]) == [ctx.b.id]
      assert people_on(~D[2026-11-20]) == [ctx.b.id]
      assert people_on(~D[2026-11-23]) == [ctx.b.id]
      assert people_on(~D[2026-11-24]) == [ctx.b.id]
      assert people_on(~D[2026-11-25]) == [ctx.a.id]
      assert ids(%TaskSeries{id: new.series_id}) == [ctx.b.id]

      # History says who, as a rule change and a people change.
      [event] = events(new, "edited") |> Enum.filter(& &1.detail["repeat"])
      assert event.detail["from"] == %{"assignee_ids" => [ctx.c.id]}
      assert event.detail["to"] == %{"assignee_ids" => [ctx.b.id]}
    end

    test "naming the people the occurrence already has isn't a change", ctx do
      changed_over_time!(ctx)

      new =
        following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue, assignee_ids: [ctx.c.id]})

      assert people_on(~D[2026-11-23]) == [ctx.mgr.id]
      assert ids(%TaskSeries{id: new.series_id}) == [ctx.mgr.id]
    end

    test "from after the latest change, and again from before it", ctx do
      changed_over_time!(ctx)

      # After: a part whose list is already the latest.
      following!(ctx, ~D[2026-11-25], %{repeat_weekdays: @add_tue})
      assert people_on(~D[2026-11-27]) == [ctx.mgr.id]
      assert people_on(~D[2026-11-23]) == [ctx.mgr.id]

      # Before: from the first part, across the split, with Thursdays too.
      new = following!(ctx, ~D[2026-11-18], %{repeat_weekdays: [1, 2, 3, 4, 5]})

      assert people_on(~D[2026-11-19]) == [ctx.c.id]
      assert people_on(~D[2026-11-20]) == [ctx.c.id]
      assert people_on(~D[2026-11-23]) == [ctx.mgr.id]
      assert people_on(~D[2026-11-26]) == [ctx.mgr.id]
      assert ids(%TaskSeries{id: new.series_id}) == [ctx.mgr.id]
    end

    test "the latest people are the chain's, when a later part took its own", ctx do
      mwf!(ctx, %{assignee_ids: [ctx.a.id]})
      following!(ctx, ~D[2026-11-23], %{repeat_weekdays: @add_tue, assignee_ids: [ctx.b.id]})

      # From the first part, whose own list is still Riley.
      new = following!(ctx, ~D[2026-11-13], %{repeat_weekdays: @mwf ++ [6]})

      assert people_on(~D[2026-11-14]) == [ctx.a.id]
      assert people_on(~D[2026-11-23]) == [ctx.b.id]
      assert ids(%TaskSeries{id: new.series_id}) == [ctx.b.id]
    end

    test "Remove all: an occurrence changed on its own goes, and its people with it", ctx do
      mwf!(ctx, %{assignee_ids: [ctx.a.id]})
      this!(ctx, ~D[2026-11-20], %{assignee_ids: [ctx.c.id]})

      following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue}, changed: :remove)

      assert people_on(~D[2026-11-20]) == [ctx.a.id]
      refute on(~D[2026-11-20]).series_exception
    end

    test "the last occurrence before a new date may be one changed on its own", ctx do
      mwf!(ctx, %{assignee_ids: [ctx.a.id]})
      this!(ctx, ~D[2026-11-23], %{assignee_ids: [ctx.c.id]})

      following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue})

      assert people_on(~D[2026-11-23]) == [ctx.c.id]
      assert people_on(~D[2026-11-24]) == [ctx.c.id]
      assert people_on(~D[2026-11-25]) == [ctx.a.id]
    end

    test "gap 2 repro: this-only, rule split from it, then following leaves it alone", ctx do
      first = mwf!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      own = [ctx.a.id, ctx.c.id]

      this!(ctx, ~D[2026-11-13], %{assignee_ids: own})
      split = following!(ctx, ~D[2026-11-13], %{repeat_weekdays: @add_tue})

      assert split.series_exception
      assert on(~D[2026-11-13]).series_exception
      assert people_on(~D[2026-11-13]) == own

      {:ok, _} =
        Tasks.update(ctx.board, reload!(first), %{assignee_ids: [ctx.b.id]}, ctx.mgr,
          scope: "following",
          today: @sat
        )

      assert people_on(~D[2026-11-09]) == [ctx.b.id]
      assert people_on(~D[2026-11-13]) == own
      assert on(~D[2026-11-13]).series_exception
      assert people_on(~D[2026-11-16]) == [ctx.b.id]
    end

    test "the control: without the split it was already left alone", ctx do
      first = mwf!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      own = [ctx.a.id, ctx.c.id]
      this!(ctx, ~D[2026-11-13], %{assignee_ids: own})

      {:ok, _} =
        Tasks.update(ctx.board, reload!(first), %{assignee_ids: [ctx.b.id]}, ctx.mgr,
          scope: "following",
          today: @sat
        )

      assert people_on(~D[2026-11-13]) == own
    end

    test "an exception left behind by a split isn't reached by a later following", ctx do
      first = mwf!(ctx, %{assignee_ids: [ctx.a.id]})
      this!(ctx, ~D[2026-11-20], %{assignee_ids: [ctx.c.id]})
      following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue})

      {:ok, _} =
        Tasks.update(ctx.board, reload!(first), %{assignee_ids: [ctx.b.id]}, ctx.mgr,
          scope: "following",
          today: @sat
        )

      assert people_on(~D[2026-11-20]) == [ctx.c.id]
      assert on(~D[2026-11-20]).series_exception
      assert people_on(~D[2026-11-18]) == [ctx.b.id]
    end

    test "a flagged anchor can still take a change made from it, and stays flagged", ctx do
      mwf!(ctx, %{assignee_ids: [ctx.a.id]})
      this!(ctx, ~D[2026-11-13], %{assignee_ids: [ctx.c.id]})

      split =
        following!(ctx, ~D[2026-11-13], %{repeat_weekdays: @add_tue, assignee_ids: [ctx.b.id]})

      assert split.series_exception
      assert people_on(~D[2026-11-13]) == [ctx.b.id]
      assert people_on(~D[2026-11-16]) == [ctx.b.id]
    end

    test "a flagged anchor the rule drops is removed as before", ctx do
      mwf!(ctx, %{assignee_ids: [ctx.a.id]})
      this!(ctx, ~D[2026-11-13], %{assignee_ids: [ctx.c.id]})

      following!(ctx, ~D[2026-11-13], %{repeat_weekdays: [2, 4]})

      assert Repo.all(from t in Task, where: t.due_on == ^~D[2026-11-13]) == []
      assert people_on(~D[2026-11-17]) == [ctx.a.id]
    end

    test "title: gap 1, each date keeps its own, and the series goes on from the latest", ctx do
      mwf!(ctx, %{assignee_ids: [ctx.a.id]})
      following!(ctx, ~D[2026-11-16], %{title: "Wash One"})
      following!(ctx, ~D[2026-11-23], %{title: "Wash Two"})

      new = following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue})

      assert on(~D[2026-11-13]).title == "Keg Wash"
      assert on(~D[2026-11-18]).title == "Wash One"
      assert on(~D[2026-11-20]).title == "Wash One"
      assert on(~D[2026-11-23]).title == "Wash Two"
      assert on(~D[2026-11-24]).title == "Wash Two"
      assert Repo.get!(TaskSeries, new.series_id).title == "Wash Two"
    end

    test "title: changed with the rule, it reaches every date", ctx do
      mwf!(ctx, %{})
      following!(ctx, ~D[2026-11-23], %{title: "Wash Two"})

      following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue, title: "Wash Three"})

      assert on(~D[2026-11-20]).title == "Wash Three"
      assert on(~D[2026-11-24]).title == "Wash Three"
    end

    test "title: gap 2, a retitled anchor stays changed on its own", ctx do
      first = mwf!(ctx, %{})
      this!(ctx, ~D[2026-11-13], %{title: "Mine"})
      following!(ctx, ~D[2026-11-13], %{repeat_weekdays: @add_tue})

      {:ok, _} =
        Tasks.update(ctx.board, reload!(first), %{title: "Theirs"}, ctx.mgr,
          scope: "following",
          today: @sat
        )

      assert on(~D[2026-11-13]).title == "Mine"
      assert on(~D[2026-11-16]).title == "Theirs"
    end

    test "notes: a part's notes survive a rule change from before it", ctx do
      mwf!(ctx, %{notes: "A"})
      following!(ctx, ~D[2026-11-23], %{repeat_weekdays: @add_tue, notes: "B"})

      new = following!(ctx, ~D[2026-11-13], %{repeat_weekdays: @mwf ++ [6]})

      assert on(~D[2026-11-16]).notes == "A"
      assert on(~D[2026-11-23]).notes == "B"
      assert Repo.get!(TaskSeries, new.series_id).notes == "B"
    end

    test "notes: an occurrence's own note isn't copied to the new date after it", ctx do
      mwf!(ctx, %{notes: "A"})

      {:ok, _} =
        Tasks.update(ctx.board, on(~D[2026-11-23]), %{notes: "Mine"}, ctx.mgr, scope: "this")

      following!(ctx, ~D[2026-11-18], %{repeat_weekdays: @add_tue})

      assert on(~D[2026-11-23]).notes == "Mine"
      assert on(~D[2026-11-24]).notes == "A"
    end
  end

  describe "create and update" do
    test "S216: two people, in the order given, and a created event", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.b.id, ctx.a.id]})

      assert ids(task) == [ctx.b.id, ctx.a.id]
      assert assert_in_step(task).assignee_id == ctx.b.id
      assert [%Event{detail: %{"assignee_ids" => list}}] = events(task, "created")
      assert list == [ctx.b.id, ctx.a.id]
    end

    test "no people: empty, no assignee_id", ctx do
      task = add!(ctx)
      assert ids(task) == []
      assert assert_in_step(task).assignee_id == nil
    end

    test "duplicates are dropped; a lone assignee_id means [id]", ctx do
      assert ids(add!(ctx, %{assignee_ids: [ctx.a.id, ctx.a.id]})) == [ctx.a.id]
      assert ids(add!(ctx, %{assignee_id: ctx.a.id})) == [ctx.a.id]
    end

    test "assignee_ids wins over a lone assignee_id", ctx do
      assert ids(add!(ctx, %{assignee_ids: [ctx.b.id], assignee_id: ctx.a.id})) == [ctx.b.id]
    end

    test "update replaces the list and logs from/to", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id]})

      assert {:ok, updated} =
               Tasks.update(ctx.board, task, %{assignee_ids: [ctx.a.id, ctx.b.id]}, ctx.mgr)

      assert updated.assignee_id == ctx.a.id
      assert assert_in_step(task)
      assert [%Event{detail: detail}] = events(task, "assigned")
      assert detail == %{"from" => [ctx.a.id], "to" => [ctx.a.id, ctx.b.id]}
    end

    test "the same list logs nothing", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      {:ok, _} = Tasks.update(ctx.board, task, %{assignee_ids: [ctx.a.id, ctx.b.id]}, ctx.mgr)
      assert events(task, "assigned") == []
    end

    test "the same people in another order isn't a change (lead decision 3)", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      {:ok, updated} =
        Tasks.update(ctx.board, task, %{assignee_ids: [ctx.b.id, ctx.a.id]}, ctx.mgr)

      assert updated.assignee_id == ctx.a.id
      assert ids(task) == [ctx.a.id, ctx.b.id]
      assert assert_in_step(task).assignee_id == ctx.a.id
      assert events(task, "assigned") == []
    end

    test "different people in a new order is a change, in the order given", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      {:ok, _} = Tasks.update(ctx.board, task, %{assignee_ids: [ctx.b.id, ctx.c.id]}, ctx.mgr)

      assert ids(task) == [ctx.b.id, ctx.c.id]
      assert [%Event{}] = events(task, "assigned")
    end

    test "an edit that doesn't mention people leaves them", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      {:ok, _} = Tasks.update(ctx.board, task, %{title: "Carb FV4"}, ctx.mgr)
      assert ids(task) == [ctx.a.id, ctx.b.id]
      assert events(task, "assigned") == []
    end

    test "empty unassigns everybody", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      {:ok, _} = Tasks.update(ctx.board, task, %{assignee_ids: []}, ctx.mgr)
      assert ids(task) == []
      assert assert_in_step(task).assignee_id == nil
    end

    test "a refused person changes nothing; the error names them", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id]})
      outsider = user_with_role("employee", "bar", %{name: "Casey Tap"})

      assert {:error, cs} =
               Tasks.update(
                 ctx.board,
                 task,
                 %{title: "New", assignee_ids: [ctx.a.id, outsider.id]},
                 ctx.mgr
               )

      assert %{assignee_ids: ["Casey Tap must be a Brewery member"]} = errors_on(cs)
      assert ids(task) == [ctx.a.id]
      assert Repo.get!(Task, task.id).title == "Carb FV3"
    end

    test "someone who has since left doesn't block an unrelated edit", ctx do
      gone = user_with_role("employee", "bar", %{name: "Casey Tap"})
      task = add!(ctx, %{assignee_ids: [ctx.a.id]})
      # A person left behind on the list, as a done task's or an old row's.
      Assignees.put!(task, [gone.id, ctx.a.id])

      assert {:ok, _} =
               Tasks.update(
                 ctx.board,
                 task,
                 %{title: "New", assignee_ids: [gone.id, ctx.a.id, ctx.b.id]},
                 ctx.mgr
               )

      assert ids(task) == [gone.id, ctx.a.id, ctx.b.id]
    end

    test "deleting a task removes its rows", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      {:ok, :deleted} = Tasks.delete(ctx.board, task, ctx.mgr)
      assert ids(task) == []
    end
  end

  describe "the board" do
    test "cards carry everyone, first first", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.b.id, ctx.a.id]})
      {:ok, board} = Tasks.board(ctx.board, @today, @today, @today)

      [%{cards: [card]}] = board.days
      assert card.task.id == task.id
      assert Enum.map(card.task.assignees, & &1.id) == [ctx.b.id, ctx.a.id]
      assert card.task.assignee.id == ctx.b.id
    end

    test "All departments shows them too", ctx do
      add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      {:ok, all} = Tasks.all_boards(@today, @today, @today)

      [%{cards: [card]}] = all.days
      assert Enum.map(card.task.assignees, & &1.id) == [ctx.a.id, ctx.b.id]
    end

    test "no N+1: the query count doesn't grow with the tasks", ctx do
      count = fn ->
        counter = :counters.new(1, [])
        handler = "count-#{System.unique_integer()}"

        :telemetry.attach(
          handler,
          [:rockcut_api, :repo, :query],
          fn _, _, _, c -> :counters.add(c, 1, 1) end,
          counter
        )

        {:ok, _} = Tasks.all_boards(@today, @today, @today)
        :telemetry.detach(handler)
        :counters.get(counter, 1)
      end

      add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      few = count.()
      for _ <- 1..10, do: add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id, ctx.c.id]})
      assert count.() == few
    end
  end

  describe "open_work (S217)" do
    test "mine is any task I'm on, second place included", ctx do
      others = add!(ctx, %{title: "Theirs", assignee_ids: [ctx.c.id]})
      nobody = add!(ctx, %{title: "Nobody's"})
      mine = add!(ctx, %{title: "Shared", assignee_ids: [ctx.a.id, ctx.b.id]})

      for me <- [ctx.a, ctx.b] do
        %{tasks: tasks} = Tasks.open_work(ctx.board, me, @today, @today)
        assert Enum.map(tasks, & &1.id) == [mine.id, nobody.id, others.id]
      end
    end
  end

  describe "leaving a department (S218)" do
    setup ctx do
      floater = add_membership(user_with_role("employee", "bar"), "brewery", "employee")
      Map.put(ctx, :floater, floater)
    end

    test "takes only that person off open tasks, and logs each", ctx do
      first = add!(ctx, %{assignee_ids: [ctx.floater.id, ctx.a.id]})
      second = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.floater.id]})
      alone = add!(ctx, %{assignee_ids: [ctx.floater.id]})
      other = add!(ctx, %{assignee_ids: [ctx.a.id]})
      done = add!(ctx, %{assignee_ids: [ctx.floater.id, ctx.a.id]})
      {:ok, _} = Tasks.complete(ctx.board, done, "planned_day", ctx.mgr, @today)

      assert {:ok, _} = Accounts.set_memberships(ctx.floater, [], ctx.mgr)

      assert ids(first) == [ctx.a.id]
      assert assert_in_step(first).assignee_id == ctx.a.id
      assert ids(second) == [ctx.a.id]
      assert ids(alone) == []
      assert assert_in_step(alone).assignee_id == nil
      assert ids(other) == [ctx.a.id]
      assert ids(done) == [ctx.floater.id, ctx.a.id]

      assert [%Event{detail: detail}] = events(first, "unassigned")

      assert detail == %{
               "from" => [ctx.floater.id, ctx.a.id],
               "to" => [ctx.a.id],
               "reason" => "left_brewery"
             }

      assert events(other, "unassigned") == []
      assert events(done, "unassigned") == []
    end

    test "series on that board lose them; new occurrences don't bring them back", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.floater.id, ctx.a.id]})

      assert {:ok, _} = Accounts.set_memberships(ctx.floater, [], ctx.mgr)

      series = series_of(first)
      assert ids(series) == [ctx.a.id]
      assert assert_in_step(series).assignee_id == ctx.a.id
      assert ids(week(first, 3)) == [ctx.a.id]

      {:ok, _} = Series.top_up(Date.add(@today, 7))
      assert ids(week(first, 53)) == [ctx.a.id]
    end

    test "their tasks on another board stay", ctx do
      bar = task_board("bar")

      {:ok, theirs} =
        Tasks.create(bar, %{title: "Lines", assignee_ids: [ctx.floater.id]}, ctx.floater)

      assert {:ok, _} = Accounts.set_memberships(ctx.floater, [], ctx.mgr)
      assert ids(theirs) == [ctx.floater.id]
    end
  end

  describe "repeats (S219)" do
    test "the series and every occurrence carry the list, top-up too", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      assert ids(series_of(first)) == [ctx.a.id, ctx.b.id]
      assert_in_step(series_of(first))

      for n <- [0, 1, 52] do
        assert ids(week(first, n)) == [ctx.a.id, ctx.b.id]
        assert_in_step(week(first, n))
      end

      assert [%Event{detail: %{"assignee_ids" => list}}] = events(first, "created")
      assert list == [ctx.a.id, ctx.b.id]

      assert {:ok, 1} = Series.top_up(Date.add(@today, 7))
      assert ids(week(first, 53)) == [ctx.a.id, ctx.b.id]
      assert_in_step(week(first, 53))
    end

    test "a refused person stops the whole series", ctx do
      outsider = user_with_role("employee", "bar", %{name: "Casey Tap"})

      assert {:error, cs} =
               Tasks.create(
                 ctx.board,
                 %{
                   title: "K",
                   due_on: @today,
                   repeat: "weekly",
                   repeat_weekdays: [3],
                   assignee_ids: [ctx.a.id, outsider.id]
                 },
                 ctx.mgr,
                 @today
               )

      assert %{assignee_ids: ["Casey Tap must be a Brewery member"]} = errors_on(cs)
      assert Repo.aggregate(TaskSeries, :count) == 0
    end

    test "\"this\": that occurrence becomes an exception with its own list", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id]})

      {:ok, updated} =
        Tasks.update(ctx.board, week(first, 2), %{assignee_ids: [ctx.a.id, ctx.b.id]}, ctx.mgr,
          scope: "this"
        )

      assert updated.series_exception
      assert ids(updated) == [ctx.a.id, ctx.b.id]
      assert ids(week(first, 3)) == [ctx.a.id]
      assert ids(series_of(first)) == [ctx.a.id]
      assert [%Event{detail: %{"scope" => "this", "to" => _}}] = events(updated, "assigned")
    end

    test "a people change without a scope asks for one", ctx do
      first = keg_wash!(ctx)

      assert {:error, :scope_required} =
               Tasks.update(ctx.board, first, %{assignee_ids: [ctx.a.id]}, ctx.mgr)

      # The list as it is isn't a change.
      assert {:ok, %Task{series_exception: false}} =
               Tasks.update(ctx.board, first, %{assignee_ids: [], title: "Keg Wash"}, ctx.mgr)
    end

    test "\"following\" changes later open ones; exceptions and finished ones keep theirs", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id]})

      {:ok, exception} =
        Tasks.update(ctx.board, week(first, 5), %{assignee_ids: [ctx.c.id]}, ctx.mgr,
          scope: "this"
        )

      {:ok, finished} = Tasks.complete(ctx.board, week(first, 4), "planned_day", ctx.mgr, @today)
      from = week(first, 3)

      assert {:ok, edited} =
               Tasks.update(ctx.board, from, %{assignee_ids: [ctx.b.id, ctx.a.id]}, ctx.mgr,
                 scope: "following"
               )

      assert ids(edited) == [ctx.b.id, ctx.a.id]
      assert assert_in_step(series_of(first)).assignee_id == ctx.b.id
      assert ids(series_of(first)) == [ctx.b.id, ctx.a.id]

      for n <- [0, 1, 2], do: assert(ids(week(first, n)) == [ctx.a.id])
      assert ids(finished) == [ctx.a.id]
      assert ids(exception) == [ctx.c.id]

      for n <- [3, 6, 52] do
        assert ids(week(first, n)) == [ctx.b.id, ctx.a.id]
        assert_in_step(week(first, n))
      end

      assert [%Event{detail: detail}] =
               Repo.all(from e in Event, where: e.action == "edited" and e.task_id == ^from.id)

      assert detail["from"] == %{"assignee_ids" => [ctx.a.id]}
      assert detail["to"] == %{"assignee_ids" => [ctx.b.id, ctx.a.id]}

      assert {:ok, 1} = Series.top_up(Date.add(@today, 7))
      assert ids(week(first, 53)) == [ctx.b.id, ctx.a.id]
    end

    test "a reorder isn't a change: no scope question, no exception, no event", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      occurrence = week(first, 2)
      shuffled = %{assignee_ids: [ctx.b.id, ctx.a.id]}

      # No scope asked.
      assert {:ok, same} = Tasks.update(ctx.board, occurrence, shuffled, ctx.mgr)
      refute same.series_exception

      # "This" doesn't make it changed on its own.
      assert {:ok, this} = Tasks.update(ctx.board, occurrence, shuffled, ctx.mgr, scope: "this")
      refute this.series_exception
      assert ids(this) == [ctx.a.id, ctx.b.id]

      # "Following" touches nothing and logs nothing.
      assert {:ok, _} = Tasks.update(ctx.board, occurrence, shuffled, ctx.mgr, scope: "following")
      assert ids(series_of(first)) == [ctx.a.id, ctx.b.id]
      assert assert_in_step(series_of(first)).assignee_id == ctx.a.id
      assert ids(week(first, 3)) == [ctx.a.id, ctx.b.id]
      assert assert_in_step(week(first, 3)).assignee_id == ctx.a.id
      assert Repo.all(from e in Event, where: e.action in ["assigned", "edited"]) == []
    end

    test "a split or a new repeat given the same people keeps the source's order", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      {:ok, split} =
        Tasks.update(
          ctx.board,
          week(first, 2),
          %{
            repeat: "weekly",
            repeat_weekdays: [3],
            repeat_interval: 2,
            assignee_ids: [ctx.b.id, ctx.a.id]
          },
          ctx.mgr,
          scope: "following",
          today: @today
        )

      assert ids(series_of(split)) == [ctx.a.id, ctx.b.id]
      assert ids(split) == [ctx.a.id, ctx.b.id]

      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      {:ok, repeating} =
        Tasks.update(
          ctx.board,
          task,
          %{repeat: "weekly", repeat_weekdays: [3], assignee_ids: [ctx.b.id, ctx.a.id]},
          ctx.mgr,
          today: @today
        )

      assert ids(series_of(repeating)) == [ctx.a.id, ctx.b.id]
      assert ids(week(repeating, 1)) == [ctx.a.id, ctx.b.id]
      assert ids(repeating) == [ctx.a.id, ctx.b.id]
    end

    test "a rule split carries the list to the new series; earlier parts keep theirs", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})
      old_series = series_of(first)
      from = week(first, 2)

      assert {:ok, edited} =
               Tasks.update(
                 ctx.board,
                 from,
                 %{repeat: "weekly", repeat_weekdays: [3], repeat_interval: 2},
                 ctx.mgr,
                 scope: "following",
                 today: @today
               )

      assert edited.id == from.id
      new_series = series_of(edited)
      assert new_series.id != old_series.id
      assert new_series.continues_series_id == old_series.id
      assert ids(new_series) == [ctx.a.id, ctx.b.id]
      assert_in_step(new_series)
      assert ids(edited) == [ctx.a.id, ctx.b.id]

      later = Repo.get_by!(Task, series_id: new_series.id, series_date: Date.add(@today, 28))
      assert ids(later) == [ctx.a.id, ctx.b.id]
      assert_in_step(later)
      assert ids(first) == [ctx.a.id, ctx.b.id]
      assert ids(old_series) == [ctx.a.id, ctx.b.id]
    end

    test "a rule split with new people gives them to the new part only", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id]})

      assert {:ok, edited} =
               Tasks.update(
                 ctx.board,
                 week(first, 2),
                 %{
                   repeat: "weekly",
                   repeat_weekdays: [3],
                   repeat_interval: 2,
                   assignee_ids: [ctx.b.id, ctx.c.id]
                 },
                 ctx.mgr,
                 scope: "following",
                 today: @today
               )

      assert ids(edited) == [ctx.b.id, ctx.c.id]
      assert ids(series_of(edited)) == [ctx.b.id, ctx.c.id]
      assert ids(first) == [ctx.a.id]
      assert ids(series_of(first)) == [ctx.a.id]
    end

    test "\"following\" reaches the parts that continue the series", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id]})

      {:ok, split} =
        Tasks.update(
          ctx.board,
          week(first, 4),
          %{repeat: "weekly", repeat_weekdays: [3], repeat_interval: 2},
          ctx.mgr,
          scope: "following",
          today: @today
        )

      assert {:ok, _} =
               Tasks.update(ctx.board, week(first, 1), %{assignee_ids: [ctx.b.id]}, ctx.mgr,
                 scope: "following"
               )

      assert ids(series_of(split)) == [ctx.b.id]
      assert ids(split) == [ctx.b.id]
      assert ids(week(first, 1)) == [ctx.b.id]
      assert ids(week(first, 0)) == [ctx.a.id]
    end

    test "an Ends-only change: occurrences it adds carry the list", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id], repeat_count: 3})
      assert week(first, 3) == nil

      assert {:ok, _} =
               Tasks.update(ctx.board, first, %{repeat_count: 6}, ctx.mgr,
                 scope: "following",
                 today: @today
               )

      assert ids(week(first, 5)) == [ctx.a.id, ctx.b.id]
      assert_in_step(week(first, 5))
    end

    test "a one-off that starts repeating keeps its list", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      {:ok, updated} =
        Tasks.update(ctx.board, task, %{repeat: "weekly", repeat_weekdays: [3]}, ctx.mgr,
          today: @today
        )

      assert updated.id == task.id
      assert ids(updated) == [ctx.a.id, ctx.b.id]
      assert ids(series_of(updated)) == [ctx.a.id, ctx.b.id]
      assert ids(week(updated, 4)) == [ctx.a.id, ctx.b.id]
      assert [%Event{detail: %{"from" => from, "to" => to}}] = events(updated, "made_repeating")
      assert {from, to} == {%{}, %{}}
    end

    test "a one-off that starts repeating with new people logs them", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id]})

      {:ok, updated} =
        Tasks.update(
          ctx.board,
          task,
          %{repeat: "weekly", repeat_weekdays: [3], assignee_ids: [ctx.b.id, ctx.c.id]},
          ctx.mgr,
          today: @today
        )

      assert ids(updated) == [ctx.b.id, ctx.c.id]
      assert assert_in_step(updated).assignee_id == ctx.b.id
      assert ids(week(updated, 1)) == [ctx.b.id, ctx.c.id]
      assert [%Event{detail: detail}] = events(updated, "made_repeating")
      assert detail["from"] == %{"assignee_ids" => [ctx.a.id]}
      assert detail["to"] == %{"assignee_ids" => [ctx.b.id, ctx.c.id]}
    end

    test "deleting a series' occurrences removes their rows and leaves the rest", ctx do
      first = keg_wash!(ctx, %{assignee_ids: [ctx.a.id]})
      gone = week(first, 2)

      {:ok, :deleted} = Tasks.delete(ctx.board, gone, ctx.mgr, scope: "following")

      assert ids(gone) == []
      assert ids(first) == [ctx.a.id]
    end
  end

  describe "History names" do
    defp stored(board, action, detail) do
      Repo.insert!(%Event{department_id: board.id, action: action, title: "Old", detail: detail})
    end

    test "old single-assignee rows name their people as before", ctx do
      stored(ctx.board, "assigned", %{"from" => ctx.a.id, "to" => ctx.b.id})
      stored(ctx.board, "created", %{"due_on" => nil, "assignee_id" => ctx.c.id})
      stored(ctx.board, "unassigned", %{"from" => ctx.mgr.id, "to" => nil, "reason" => "left_x"})

      %{names: %{users: users}} = Tasks.list_events(ctx.board)

      assert users == %{
               ctx.a.id => "Riley Wort",
               ctx.b.id => "Jordan Float",
               ctx.c.id => "Sam Mash",
               ctx.mgr.id => "Kate Kettle"
             }
    end

    test "old edited maps too", ctx do
      stored(ctx.board, "edited", %{
        "from" => %{"assignee_id" => ctx.a.id},
        "to" => %{"assignee_id" => nil}
      })

      assert Tasks.list_events(ctx.board).names.users == %{ctx.a.id => "Riley Wort"}
    end

    test "new id lists are named, at the top level and inside maps", ctx do
      stored(ctx.board, "assigned", %{"from" => [ctx.a.id], "to" => [ctx.a.id, ctx.b.id]})
      stored(ctx.board, "created", %{"assignee_ids" => [ctx.c.id]})

      stored(ctx.board, "made_repeating", %{
        "from" => %{"assignee_ids" => []},
        "to" => %{"assignee_ids" => [ctx.mgr.id]}
      })

      assert Tasks.list_events(ctx.board).names.users == %{
               ctx.a.id => "Riley Wort",
               ctx.b.id => "Jordan Float",
               ctx.c.id => "Sam Mash",
               ctx.mgr.id => "Kate Kettle"
             }
    end

    test "a moved event's maps name nobody", ctx do
      stored(ctx.board, "moved", %{"from" => %{"due_on" => nil}, "to" => %{"due_on" => nil}})
      assert Tasks.list_events(ctx.board).names.users == %{}
    end
  end
end
