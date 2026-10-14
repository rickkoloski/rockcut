defmodule RockcutApi.TaskBoardTest do
  @moduledoc "D38: the board read model (`Tasks.board/3`) and its day header (§3.2)."
  use RockcutApi.DataCase, async: true

  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  alias RockcutApi.Tasks
  alias RockcutApi.Scheduling.Recurrence

  # October is MDT (UTC-6).
  @mon ~D[2026-10-12]
  @tue ~D[2026-10-13]
  @today ~D[2026-10-14]
  @thu ~D[2026-10-15]
  @sun ~D[2026-10-18]

  setup do
    brewery = department_fixture("brewery")
    bar = department_fixture("bar")

    order = fn user, n ->
      user |> Ecto.Changeset.change(schedule_order: n) |> Repo.update!()
    end

    %{
      brewery: brewery,
      bar: bar,
      brewer_pos: position_fixture(%{name: "Brewer", department: brewery}),
      cellar_pos: position_fixture(%{name: "Cellar", department: brewery}),
      # Roster order puts Zoe first, whatever the alphabet says.
      zoe: user_with_role("employee", "brewery", %{name: "Zoe Hops"}) |> order.(1),
      kate: user_with_role("employee", "brewery", %{name: "Kate Brewer"}) |> order.(2),
      mgr: user_with_role("manager", "brewery", %{name: "Morgan Mash"}) |> order.(3)
    }
  end

  defp at(date, hh), do: Recurrence.local_to_utc(date, Time.new!(hh, 0, 0))

  defp shift!(ctx, date, from_h, to_h, attrs) do
    shift_fixture(
      Map.merge(
        %{
          department: ctx.brewery,
          position: ctx.brewer_pos,
          status: "published",
          starts_at: at(date, from_h),
          ends_at: at(date, to_h)
        },
        attrs
      )
    )
  end

  defp header(day), do: Tasks.headers(Tasks.department!().id, [day])[day]

  defp add!(actor, title, due_on) do
    {:ok, task} = Tasks.create(%{title: title, due_on: due_on}, actor)
    task
  end

  describe "the day header" do
    test "published Brewery shifts only, one line per person in roster order", ctx do
      shift!(ctx, @today, 7, 15, %{assignee_id: ctx.kate.id})
      shift!(ctx, @today, 8, 12, %{assignee_id: ctx.zoe.id, position: ctx.cellar_pos})
      # A draft (S3) and another department's shift (S4) aren't shown.
      shift!(ctx, @today, 9, 17, %{assignee_id: ctx.mgr.id, status: "draft"})

      shift!(ctx, @today, 9, 17, %{
        assignee_id: ctx.mgr.id,
        department: ctx.bar,
        position: position_fixture(%{department: ctx.bar})
      })

      h = header(@today)
      assert Enum.map(h.people, & &1.user.name) == ["Zoe Hops", "Kate Brewer"]
      assert [%{hours: 4.0, shifts: [%{position: %{name: "Cellar"}}]}, %{hours: 8.0}] = h.people
      assert h.open_shifts == []
    end

    test "two shifts on one line with the total hours", ctx do
      shift!(ctx, @today, 13, 17, %{assignee_id: ctx.kate.id})
      shift!(ctx, @today, 6, 10, %{assignee_id: ctx.kate.id})

      assert [%{user: %{name: "Kate Brewer"}, hours: 8.0, shifts: [first, second]}] =
               header(@today).people

      assert first.starts_at == at(@today, 6)
      assert second.starts_at == at(@today, 13)
    end

    test "open shifts are listed apart", ctx do
      shift!(ctx, @today, 7, 15, %{assignee_id: ctx.kate.id})
      open = shift!(ctx, @today, 15, 23, %{})

      assert %{people: [_], open_shifts: [%{id: id}]} = header(@today)
      assert id == open.id
    end

    test "a shift belongs to the Colorado day it starts on", ctx do
      # 9 pm Wednesday MDT is 3 am Thursday UTC.
      shift!(ctx, @today, 21, 23, %{assignee_id: ctx.kate.id})

      assert [%{user: %{name: "Kate Brewer"}}] = header(@today).people
      assert header(@thu).people == []
    end

    test "no published Brewery shifts: empty people and open shifts", ctx do
      shift!(ctx, @today, 7, 15, %{assignee_id: ctx.kate.id, status: "draft"})
      assert %{people: [], open_shifts: [], events: []} = header(@today)
    end

    test "published Brewery events overlapping the day", ctx do
      all_day =
        event_fixture(%{
          department: ctx.brewery,
          status: "published",
          all_day: true,
          title: "Brew day",
          starts_at: Recurrence.local_midnight(@today),
          ends_at: Recurrence.local_midnight(@thu)
        })

      long =
        event_fixture(%{
          department: ctx.brewery,
          status: "published",
          title: "Inspection",
          starts_at: at(@tue, 9),
          ends_at: at(@thu, 12)
        })

      event_fixture(%{
        department: ctx.brewery,
        status: "draft",
        starts_at: at(@today, 9),
        ends_at: at(@today, 10)
      })

      event_fixture(%{
        department: ctx.bar,
        status: "published",
        starts_at: at(@today, 9),
        ends_at: at(@today, 10)
      })

      headers = Tasks.headers(ctx.brewery.id, Date.range(@mon, @thu))
      assert Enum.map(headers[@today].events, & &1.id) == [long.id, all_day.id]
      assert Enum.map(headers[@tue].events, & &1.id) == [long.id]
      assert Enum.map(headers[@thu].events, & &1.id) == [long.id]
      assert headers[@mon].events == []
    end
  end

  describe "board/3" do
    test "days with cards, header and Daily card; Unfinished ignores the range", ctx do
      old = add!(ctx.kate, "Carb FV3", Date.add(@today, -10))
      mon = add!(ctx.kate, "Filter FV2 > FV3", @mon)
      wed = add!(ctx.kate, "Package FV6", @today)
      future = add!(ctx.kate, "Clean the cold room", nil)
      later = add!(ctx.kate, "Dry hop FV1", Date.add(@sun, 7))
      # Finished today from Monday, shown on today.
      {:ok, _} = Tasks.complete(mon, "completed_day", ctx.kate, @today)
      shift!(ctx, @today, 7, 15, %{assignee_id: ctx.kate.id})

      assert {:ok, board} = Tasks.board(@mon, @sun, @today)
      assert board.from == @mon and board.to == @sun and board.today == @today
      assert Enum.map(board.days, & &1.date) == Enum.to_list(Date.range(@mon, @sun))

      day = fn d -> Enum.find(board.days, &(&1.date == d)) end
      assert day.(@mon).cards == []
      assert Enum.map(day.(@today).cards, & &1.key) == [{wed.id, @today}, {mon.id, @today}]
      assert [%{user: %{name: "Kate Brewer"}}] = day.(@today).header.people
      assert %{done: 0, total: 4} = day.(@today).daily

      assert [%{key: {id, :unfinished}, overdue: true, planned_on: planned}] = board.unfinished
      assert id == old.id and planned == old.due_on
      assert [%{key: {fid, :future}}] = board.future
      assert fid == future.id

      # Names come preloaded.
      assert %{task: %{created_by: %{name: "Kate Brewer"}}} = hd(day.(@today).cards)
      refute Enum.any?(board.days, fn d -> Enum.any?(d.cards, &(&1.task.id == later.id)) end)
    end

    test "a task finished elsewhere shows on its finished day only when that's in range", ctx do
      task = add!(ctx.kate, "Carb FV3", @mon)
      {:ok, _} = Tasks.complete(task, "completed_day", ctx.kate, @today)

      {:ok, board} = Tasks.board(@today, @today, @today)
      assert [%{key: {_, @today}, planned_on: @mon, locked: true}] = hd(board.days).cards

      {:ok, board} = Tasks.board(@mon, @mon, @today)
      assert hd(board.days).cards == []
      assert board.unfinished == []
    end

    test "the range is 1 to 31 days, from ≤ to" do
      department_fixture("brewery")
      assert {:ok, %{days: [_]}} = Tasks.board(@today, @today, @today)
      assert {:ok, %{days: days}} = Tasks.board(@today, Date.add(@today, 30), @today)
      assert length(days) == 31

      assert {:error, :range_too_long} =
               Tasks.board(@today, Date.add(@today, 31), @today)

      assert {:error, :range_too_long} = Tasks.board(@today, @tue, @today)
    end
  end
end
