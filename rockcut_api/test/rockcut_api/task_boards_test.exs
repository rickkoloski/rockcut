defmodule RockcutApi.TaskBoardsTest do
  @moduledoc """
  D41 (plan step 3): one board per department. Every lookup and write stays
  on its board (S115), assignees come from the board's department (S105),
  leaving a department clears only that board (S112), History is per board
  (S108), the header is the department's, and the top-up covers every board
  (S116).
  """
  use RockcutApi.DataCase, async: false

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.{Accounts, Tasks}
  alias RockcutApi.Scheduling.Recurrence
  alias RockcutApi.Tasks.{Event, Series, Task, TaskSeries}

  # A Wednesday.
  @today ~D[2026-10-14]

  setup do
    brewery = department_fixture("brewery")
    # Named as on a real DB (D32 renamed Bar to Taproom).
    bar = department_fixture("bar", "Taproom")

    %{
      brewery: brewery,
      bar: bar,
      brewer: user_with_role("employee", "brewery", %{name: "Kate Brewer"}),
      bartender: user_with_role("employee", "bar", %{name: "Sam Pour"}),
      bar_mgr: user_with_role("manager", "bar", %{name: "Casey Tap"}),
      owner: owner_fixture(%{name: "Olivia Owner"})
    }
  end

  defp add!(dept, actor, attrs) do
    {:ok, task} = Tasks.create(dept, Map.merge(%{due_on: @today}, attrs), actor, @today)
    task
  end

  defp item!(dept, actor, name) do
    {:ok, item} = Tasks.create_item(dept, %{name: name}, actor)
    item
  end

  describe "each board keeps to itself (S115)" do
    test "a task is found only on its own board", ctx do
      t = add!(ctx.brewery, ctx.brewer, %{title: "Keg Wash"})
      assert Tasks.get_task(ctx.brewery, t.id).id == t.id
      assert Tasks.get_task(ctx.brewery, to_string(t.id)).id == t.id
      refute Tasks.get_task(ctx.bar, t.id)
      refute Tasks.get_task(ctx.bar, "nope")
    end

    test "every write given another board's task is not found, and changes nothing", ctx do
      t = add!(ctx.brewery, ctx.brewer, %{title: "Keg Wash"})
      before = Repo.get!(Task, t.id)
      events = Repo.aggregate(Event, :count)
      bar = ctx.bar

      for result <- [
            Tasks.update(bar, t, %{title: "Hijacked"}, ctx.owner),
            Tasks.move(bar, t, Date.add(@today, 1), nil, ctx.owner),
            Tasks.complete(bar, t, nil, ctx.owner, @today),
            Tasks.uncomplete(bar, t, ctx.owner),
            Tasks.delete(bar, t, ctx.owner),
            Tasks.stop_repeating(bar, t, ctx.owner),
            Tasks.series_info(bar, t)
          ],
          do: assert(result == {:error, :not_found})

      assert Repo.get!(Task, t.id) == before
      assert Repo.aggregate(Event, :count) == events
    end

    test "an occurrence of another board's series is not found either", ctx do
      {:ok, first} =
        Tasks.create(
          ctx.brewery,
          %{title: "Keg Wash", due_on: @today, repeat: "weekly", repeat_weekdays: [3]},
          ctx.brewer,
          @today
        )

      count = Repo.aggregate(Task, :count)
      assert Tasks.delete(ctx.bar, first, ctx.owner, scope: "following") == {:error, :not_found}

      assert Tasks.update(ctx.bar, first, %{title: "x"}, ctx.owner, scope: "following") ==
               {:error, :not_found}

      assert Repo.aggregate(Task, :count) == count
    end

    test "Daily items: found, ticked, renamed, retired, restored and ordered only on their board",
         ctx do
      hoses = item!(ctx.brewery, ctx.owner, "Hoses")
      assert Tasks.get_item(ctx.brewery, hoses.id).id == hoses.id
      refute Tasks.get_item(ctx.bar, hoses.id)
      bar = ctx.bar

      for result <- [
            Tasks.tick(bar, @today, hoses, ctx.owner, @today),
            Tasks.untick(bar, @today, hoses, ctx.owner, @today),
            Tasks.rename_item(bar, hoses, "Hijacked", ctx.owner),
            Tasks.retire_item(bar, hoses, ctx.owner),
            Tasks.restore_item(bar, hoses, ctx.owner)
          ],
          do: assert(result == {:error, :not_found})

      # The Taproom has no items, so the Brewery's ids aren't its order.
      assert {:error, :invalid_order} = Tasks.order_items(bar, [hoses.id], ctx.owner)
      assert Repo.reload!(hoses) == hoses
      assert Tasks.list_items(ctx.bar) == []
    end

    test "board/4 shows only its own department's tasks and Daily items", ctx do
      brew = add!(ctx.brewery, ctx.brewer, %{title: "Keg Wash"})
      pour = add!(ctx.bar, ctx.bartender, %{title: "Clean lines"})
      _future = add!(ctx.bar, ctx.bartender, %{title: "Order CO2", due_on: nil})
      item!(ctx.brewery, ctx.owner, "Hoses")

      {:ok, bar} = Tasks.board(ctx.bar, @today, @today, @today)
      [day] = bar.days
      assert Enum.map(day.cards, & &1.task.id) == [pour.id]
      assert Enum.map(bar.future, & &1.task.title) == ["Order CO2"]
      assert day.daily.total == 0

      {:ok, brewery} = Tasks.board(ctx.brewery, @today, @today, @today)
      assert Enum.map(hd(brewery.days).cards, & &1.task.id) == [brew.id]
      assert brewery.future == []
      # Its four defaults and Hoses.
      assert hd(brewery.days).daily.total == 5
    end

    test "positions are per board: each board's day list starts at 1", ctx do
      a = add!(ctx.brewery, ctx.brewer, %{title: "A"})
      b = add!(ctx.bar, ctx.bartender, %{title: "B"})
      assert {a.position, b.position} == {1, 1}

      {:ok, 1} = Tasks.move_overdue_to_today(ctx.bar, ctx.bartender, Date.add(@today, 1))
      assert Repo.get!(Task, a.id).due_on == @today
    end
  end

  describe "the assignee comes from the board's department (S105)" do
    test "a Taproom task takes Taproom members and owners, not a brewer", ctx do
      assert {:ok, t} =
               Tasks.create(
                 ctx.bar,
                 %{title: "Lines", assignee_id: ctx.bartender.id},
                 ctx.bar_mgr
               )

      assert t.assignee_id == ctx.bartender.id
      assert {:ok, _} = Tasks.update(ctx.bar, t, %{assignee_id: ctx.owner.id}, ctx.bar_mgr)

      assert {:error, cs} =
               Tasks.create(ctx.bar, %{title: "Lines", assignee_id: ctx.brewer.id}, ctx.bar_mgr)

      assert %{assignee_id: ["must be a Taproom member"]} = errors_on(cs)
      assert {:error, cs} = Tasks.update(ctx.bar, t, %{assignee_id: ctx.brewer.id}, ctx.bar_mgr)
      assert %{assignee_id: ["must be a Taproom member"]} = errors_on(cs)
      assert Repo.get!(Task, t.id).assignee_id == ctx.owner.id
    end

    test "a series on the Taproom board takes Taproom members only", ctx do
      repeat = %{title: "Lines", due_on: @today, repeat: "weekly", repeat_weekdays: [3]}

      assert {:error, cs} =
               Tasks.create(
                 ctx.bar,
                 Map.put(repeat, :assignee_id, ctx.brewer.id),
                 ctx.bar_mgr,
                 @today
               )

      assert %{assignee_id: ["must be a Taproom member"]} = errors_on(cs)

      assert {:ok, first} =
               Tasks.create(
                 ctx.bar,
                 Map.put(repeat, :assignee_id, ctx.bartender.id),
                 ctx.bar_mgr,
                 @today
               )

      assert Repo.get!(TaskSeries, first.series_id).department_id == ctx.bar.id
    end
  end

  describe "leaving a department clears only that board (S112)" do
    setup ctx do
      # Kate works in both departments.
      kate = add_membership(ctx.brewer, "bar", "employee")
      weekly = %{due_on: @today, repeat: "weekly", repeat_weekdays: [3], assignee_id: kate.id}

      %{
        kate: kate,
        brew: add!(ctx.brewery, ctx.owner, %{title: "Keg Wash", assignee_id: kate.id}),
        pour: add!(ctx.bar, ctx.owner, %{title: "Clean lines", assignee_id: kate.id}),
        brew_series: add!(ctx.brewery, ctx.owner, Map.put(weekly, :title, "Brite CIP")),
        bar_series: add!(ctx.bar, ctx.owner, Map.put(weekly, :title, "Glass wash"))
      }
    end

    test "out of the Taproom: Taproom tasks and series unassigned, logged there; Brewery ones keep her",
         ctx do
      assert {:ok, _} =
               Accounts.set_memberships(
                 ctx.kate,
                 [%{"department" => "brewery", "role" => "employee"}],
                 ctx.owner
               )

      assert Repo.get!(Task, ctx.pour.id).assignee_id == nil
      assert Repo.get!(TaskSeries, ctx.bar_series.series_id).assignee_id == nil
      assert Repo.get!(Task, ctx.brew.id).assignee_id == ctx.kate.id
      assert Repo.get!(TaskSeries, ctx.brew_series.series_id).assignee_id == ctx.kate.id

      unassigned = Repo.all(from e in Event, where: e.action == "unassigned")
      assert unassigned != []
      assert Enum.all?(unassigned, &(&1.department_id == ctx.bar.id))
      assert Enum.all?(unassigned, &(&1.detail["reason"] == "left_bar"))
      assert ctx.pour.id in Enum.map(unassigned, & &1.task_id)

      %{events: history} = Tasks.list_events(ctx.brewery)
      refute Enum.any?(history, &(&1.action == "unassigned"))
    end

    test "deactivated: every board", ctx do
      assert {:ok, _} = Accounts.update_user(ctx.kate, %{"active" => false}, ctx.owner)
      assert Repo.get!(Task, ctx.pour.id).assignee_id == nil
      assert Repo.get!(Task, ctx.brew.id).assignee_id == nil
      assert Repo.get!(TaskSeries, ctx.brew_series.series_id).assignee_id == nil
    end
  end

  describe "History is per board (S108)" do
    test "each board's events, Daily items included; a task's History only on its board", ctx do
      brew = add!(ctx.brewery, ctx.brewer, %{title: "Keg Wash"})
      pour = add!(ctx.bar, ctx.bartender, %{title: "Clean lines"})
      lines = item!(ctx.bar, ctx.bar_mgr, "Lines cleaned")
      {:ok, _} = Tasks.tick(ctx.bar, @today, lines, ctx.bartender, @today)
      {:ok, _} = Tasks.order_items(ctx.bar, [lines.id], ctx.bar_mgr)

      %{events: bar, total: bar_total} = Tasks.list_events(ctx.bar)
      assert Enum.map(bar, & &1.action) == ["daily_ticked", "item_added", "created"]
      assert bar_total == 3
      assert Enum.all?(bar, &(&1.department_id == ctx.bar.id))

      %{events: brewery} = Tasks.list_events(ctx.brewery)
      assert Enum.map(brewery, &{&1.action, &1.task_id}) == [{"created", brew.id}]

      assert %{events: [_]} = Tasks.list_events(ctx.bar, pour.id)
      assert %{events: [], total: 0} = Tasks.list_events(ctx.bar, brew.id)
    end

    test "every event a board writes carries its department", ctx do
      t = add!(ctx.bar, ctx.bartender, %{title: "Clean lines"})
      {:ok, t} = Tasks.update(ctx.bar, t, %{title: "Clean all lines"}, ctx.bartender)
      {:ok, t} = Tasks.move(ctx.bar, t, Date.add(@today, 1), nil, ctx.bartender)
      {:ok, _} = Tasks.complete(ctx.bar, t, "planned_day", ctx.bartender, @today)

      {:ok, first} =
        Tasks.create(
          ctx.bar,
          %{title: "Glass wash", due_on: @today, repeat: "weekly", repeat_weekdays: [3]},
          ctx.bartender,
          @today
        )

      {:ok, _} = Tasks.stop_repeating(ctx.bar, first, ctx.bartender)
      item = item!(ctx.bar, ctx.bar_mgr, "Lines cleaned")
      {:ok, _} = Tasks.retire_item(ctx.bar, item, ctx.bar_mgr)

      assert Repo.all(from e in Event, select: e.department_id) |> Enum.uniq() == [ctx.bar.id]
    end

    test "a deleted task reads as deleted only on its own board (D39 O-1)", ctx do
      t = add!(ctx.brewery, ctx.brewer, %{title: "Keg Wash"})
      {:ok, :deleted} = Tasks.delete(ctx.brewery, t, ctx.brewer)
      assert Tasks.deleted_task?(ctx.brewery, t.id)
      refute Tasks.deleted_task?(ctx.bar, t.id)
    end
  end

  describe "the header is the board's department's" do
    test "Taproom shifts and events on the Taproom board, Brewery ones on the Brewery's", ctx do
      at = fn h -> Recurrence.local_to_utc(@today, Time.new!(h, 0, 0)) end

      for {dept, user} <- [{ctx.bar, ctx.bartender}, {ctx.brewery, ctx.brewer}] do
        shift_fixture(%{
          department: dept,
          assignee_id: user.id,
          status: "published",
          starts_at: at.(9),
          ends_at: at.(17)
        })

        event_fixture(%{
          department: dept,
          status: "published",
          starts_at: at.(9),
          ends_at: at.(10)
        })
      end

      bar = Tasks.headers(ctx.bar, [@today])[@today]
      brewery = Tasks.headers(ctx.brewery, [@today])[@today]
      assert Enum.map(bar.people, & &1.user.id) == [ctx.bartender.id]
      assert Enum.map(brewery.people, & &1.user.id) == [ctx.brewer.id]
      assert [%{department_id: bar_id}] = bar.events
      assert bar_id == ctx.bar.id
      assert [%{department_id: brewery_id}] = brewery.events
      assert brewery_id == ctx.brewery.id
    end
  end

  describe "the top-up covers every board (S116)" do
    test "a weekly series on the Taproom and one on the Brewery both reach 12 months, each on its own board",
         ctx do
      weekly = %{due_on: @today, repeat: "weekly", repeat_weekdays: [3]}
      bar = add!(ctx.bar, ctx.bartender, Map.put(weekly, :title, "Glass wash"))
      brew = add!(ctx.brewery, ctx.brewer, Map.put(weekly, :title, "Keg Wash"))

      later = Date.add(@today, 28)
      assert {:ok, added} = Series.top_up(later)
      assert added == 8

      horizon = Date.shift(later, year: 1)

      for {first, dept} <- [{bar, ctx.bar}, {brew, ctx.brewery}] do
        tasks = Repo.all(from t in Task, where: t.series_id == ^first.series_id)
        # The last Wednesday on or before the horizon.
        assert Enum.max(Enum.map(tasks, & &1.series_date), Date) == ~D[2027-11-10]
        assert Date.diff(horizon, ~D[2027-11-10]) in 0..6
        assert Enum.all?(tasks, &(&1.department_id == dept.id))
        assert Repo.get!(TaskSeries, first.series_id).generated_through == horizon
      end
    end
  end

  describe "boards_for/1 (/api/me's task_boards)" do
    test "the boards a person can open, in department order (by id); owners get all four",
         ctx do
      department_fixture("office")
      department_fixture("sales")

      keys = fn user ->
        user |> Tasks.boards_for() |> Enum.map(&{&1.department.key, &1.manage})
      end

      assert keys.(Accounts.get_user!(ctx.bar_mgr.id)) == [{"bar", true}]
      assert keys.(Accounts.get_user!(ctx.brewer.id)) == [{"brewery", false}]

      assert keys.(Accounts.get_user!(ctx.owner.id)) ==
               [{"brewery", true}, {"bar", true}, {"office", true}, {"sales", true}]
    end
  end
end
