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

  defp events(%Task{id: id}, action),
    do: Repo.all(from e in Event, where: e.task_id == ^id and e.action == ^action, order_by: e.id)

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

    test "the same list logs nothing; a new order is a change", ctx do
      task = add!(ctx, %{assignee_ids: [ctx.a.id, ctx.b.id]})

      {:ok, _} = Tasks.update(ctx.board, task, %{assignee_ids: [ctx.a.id, ctx.b.id]}, ctx.mgr)
      assert events(task, "assigned") == []

      {:ok, _} = Tasks.update(ctx.board, task, %{assignee_ids: [ctx.b.id, ctx.a.id]}, ctx.mgr)
      assert [%Event{}] = events(task, "assigned")
      assert assert_in_step(task).assignee_id == ctx.b.id
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
