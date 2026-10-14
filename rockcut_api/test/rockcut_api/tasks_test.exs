defmodule RockcutApi.TasksTest do
  # Not async: the concurrent-move test runs two processes on the shared
  # sandbox connection.
  use RockcutApi.DataCase, async: false

  import RockcutApi.TaskFixtures

  import Ecto.Query, only: [from: 2]
  import RockcutApi.AccountsFixtures

  alias RockcutApi.Tasks
  alias RockcutApi.Tasks.{DailyItem, Event, Task}

  @mon ~D[2026-10-12]
  @tue ~D[2026-10-13]
  @today ~D[2026-10-14]
  @thu ~D[2026-10-15]

  describe "today (S51)" do
    test "11:30 pm Colorado in winter (MST, UTC-7) is still that day" do
      # Tue 1/12 23:30 MST = Wed 1/13 06:30 UTC.
      assert Tasks.today_at(~U[2027-01-13 06:30:00Z]) == ~D[2027-01-12]
    end

    test "11:30 pm Colorado in summer (MDT, UTC-6) is still that day" do
      # Mon 7/12 23:30 MDT = Tue 7/13 05:30 UTC.
      assert Tasks.today_at(~U[2027-07-13 05:30:00Z]) == ~D[2027-07-12]
    end

    test "midnight Colorado starts the next day" do
      assert Tasks.today_at(~U[2027-01-13 07:00:00Z]) == ~D[2027-01-13]
      assert Tasks.today_at(~U[2027-07-13 06:00:00Z]) == ~D[2027-07-13]
    end

    test "today/0 is a date" do
      assert %Date{} = Tasks.today()
    end

    test "a task finished at 11:30 pm Colorado is completed on that Colorado day" do
      %{brewer: brewer} = people()
      task = add!(brewer, "Late clean", ~D[2027-01-12])
      today = Tasks.today_at(~U[2027-01-13 06:30:00Z])

      assert {:ok, done} = Tasks.complete(brewery_board(), task, nil, brewer, today)
      assert done.completed_on == ~D[2027-01-12]
      assert done.completed_display == "planned_day"
    end
  end

  test "a new Brewery department starts with the four default Daily items, in order" do
    brewery = department_fixture("brewery")

    names =
      Repo.all(
        from i in DailyItem,
          where: i.department_id == ^brewery.id and i.active,
          order_by: i.position,
          select: i.name
      )

    assert names == ~w(Backups Gravities Temps Pressures)
  end

  describe "create/2" do
    setup :people

    test "adds at the bottom of a day, and of Future", %{brewer: brewer} do
      a = add!(brewer, "Package FV6", @today)
      b = add!(brewer, "Keg wash", @today)
      f1 = add!(brewer, "Gas order and Tanks Out", nil)
      f2 = add!(brewer, "Line clean?", nil)

      assert {a.position, b.position} == {1, 2}
      assert {f1.position, f2.position} == {1, 2}
      assert titles(@today) == ["Package FV6", "Keg wash"]
      assert titles(nil) == ["Gas order and Tanks Out", "Line clean?"]
      assert b.created_by_id == brewer.id
      assert [%Event{action: "created", title: "Keg wash"}] = events(b)
    end

    test "trims the title and validates its length (S17)", %{brewer: brewer} do
      assert {:ok, %Task{title: "Package FV6"}} =
               Tasks.create(brewery_board(), %{title: "  Package FV6  ", due_on: @today}, brewer)

      assert {:error, cs} = Tasks.create(brewery_board(), %{title: "   "}, brewer)
      assert %{title: ["can't be blank"]} = errors_on(cs)

      assert {:error, cs} =
               Tasks.create(brewery_board(), %{title: String.duplicate("x", 201)}, brewer)

      assert %{title: [_]} = errors_on(cs)
      assert Repo.aggregate(Task, :count) == 1
    end

    test "the assignee must be an active Brewery person", %{brewer: brewer} do
      bartender = user_with_role("employee", "bar")
      gone = user_with_role("employee", "brewery", %{active: false})
      device = device_fixture(%{home: "brewery"})
      floater = user_with_role("employee", "bar") |> add_membership("brewery", "employee")

      for bad <- [bartender, gone, device] do
        assert {:error, cs} =
                 Tasks.create(
                   brewery_board(),
                   %{title: "x", due_on: @today, assignee_id: bad.id},
                   brewer
                 )

        assert %{assignee_id: ["must be a Brewery member"]} = errors_on(cs)
      end

      assert {:ok, %Task{assignee_id: id}} =
               Tasks.create(brewery_board(), %{title: "x", assignee_id: floater.id}, brewer)

      assert id == floater.id
    end

    test "a date as a string", %{brewer: brewer} do
      assert {:ok, %Task{due_on: @thu}} =
               Tasks.create(brewery_board(), %{"title" => "x", "due_on" => "2026-10-15"}, brewer)
    end
  end

  describe "update/3" do
    setup :people

    test "edits title and notes, logging old → new", %{brewer: brewer} do
      task = add!(brewer, "Keg Wash", @today)

      assert {:ok, updated} =
               Tasks.update(
                 brewery_board(),
                 task,
                 %{title: "Keg Wash + sanitize", notes: "Hot"},
                 brewer
               )

      assert updated.title == "Keg Wash + sanitize"

      assert [%Event{action: "edited", detail: detail}, _created] = events(task)

      assert detail == %{
               "from" => %{"title" => "Keg Wash", "notes" => nil},
               "to" => %{"title" => "Keg Wash + sanitize", "notes" => "Hot"}
             }
    end

    test "assigning logs `assigned`", %{brewer: brewer, brewer2: brewer2} do
      task = add!(brewer, "Package FV6", @today)

      assert {:ok, %Task{assignee_id: id}} =
               Tasks.update(brewery_board(), task, %{assignee_id: brewer.id}, brewer2)

      assert id == brewer.id
      assert [%Event{action: "assigned", detail: %{"from" => nil, "to" => ^id}}, _] = events(task)
    end

    test "a day change moves it to the bottom of that day", %{brewer: brewer} do
      a = add!(brewer, "A", @today)
      _b = add!(brewer, "B", @today)
      _c = add!(brewer, "C", @thu)

      assert {:ok, %Task{due_on: @thu, position: 2}} =
               Tasks.update(brewery_board(), a, %{due_on: @thu}, brewer)

      assert titles(@today) == ["B"]
      assert titles(@thu) == ["C", "A"]
      assert dense?(@today) and dense?(@thu)
      assert [%Event{action: "moved"}, _] = events(a)
    end

    test "No day moves it to the bottom of Future", %{brewer: brewer} do
      _f = add!(brewer, "F", nil)
      a = add!(brewer, "A", @today)

      assert {:ok, %Task{due_on: nil, position: 2}} =
               Tasks.update(brewery_board(), a, %{due_on: nil}, brewer)

      assert titles(nil) == ["F", "A"]
    end

    test "an invalid edit changes nothing", %{brewer: brewer} do
      task = add!(brewer, "A", @today)

      assert {:error, %Ecto.Changeset{}} =
               Tasks.update(brewery_board(), task, %{title: ""}, brewer)

      assert Repo.get!(Task, task.id).title == "A"
      assert [%Event{action: "created"}] = events(task)
    end

    test "a locked task can't change day", %{brewer: brewer} do
      task = add!(brewer, "A", @mon)
      {:ok, _} = Tasks.complete(brewery_board(), task, "completed_day", brewer, @today)
      assert {:error, :locked} = Tasks.update(brewery_board(), task, %{due_on: @thu}, brewer)
      assert {:ok, _} = Tasks.update(brewery_board(), task, %{title: "A2"}, brewer)
    end
  end

  describe "move/4" do
    setup :people

    setup %{brewer: brewer} do
      tasks =
        for {title, day} <- [
              {"T1", @today},
              {"T2", @today},
              {"T3", @today},
              {"H1", @thu},
              {"H2", @thu},
              {"F1", nil},
              {"F2", nil}
            ],
            into: %{},
            do: {title, add!(brewer, title, day)}

      %{t: tasks}
    end

    test "within a day, to the top (S12)", %{brewer: brewer, t: t} do
      assert {:ok, %Task{position: 1}} =
               Tasks.move(brewery_board(), t["T3"], @today, t["T1"].id, brewer)

      assert titles(@today) == ~w(T3 T1 T2)
      assert dense?(@today)

      assert [%Event{action: "moved", detail: detail}, _] = events(t["T3"])

      assert detail == %{
               "from" => %{"due_on" => "2026-10-14", "position" => 3},
               "to" => %{"due_on" => "2026-10-14", "position" => 1}
             }
    end

    test "within a day, to the bottom", %{brewer: brewer, t: t} do
      assert {:ok, _} = Tasks.move(brewery_board(), t["T1"], @today, nil, brewer)
      assert titles(@today) == ~w(T2 T3 T1)
    end

    test "across days, between two tasks (S13)", %{brewer: brewer, t: t} do
      assert {:ok, %Task{due_on: @thu, position: 2}} =
               Tasks.move(brewery_board(), t["T2"], "2026-10-15", "#{t["H2"].id}", brewer)

      assert titles(@today) == ~w(T1 T3)
      assert titles(@thu) == ~w(H1 T2 H2)
      assert dense?(@today) and dense?(@thu)
    end

    test "onto Future, and off it (S23d, S23e)", %{brewer: brewer, t: t} do
      assert {:ok, %Task{due_on: nil}} =
               Tasks.move(brewery_board(), t["T1"], nil, t["F2"].id, brewer)

      assert titles(nil) == ~w(F1 T1 F2)
      assert titles(@today) == ~w(T2 T3)

      assert [%Event{detail: %{"to" => %{"due_on" => nil, "position" => 2}}}, _] =
               events(t["T1"])

      assert {:ok, %Task{due_on: @thu}} =
               Tasks.move(brewery_board(), t["F1"], @thu, t["H1"].id, brewer)

      assert titles(@thu) == ~w(F1 H1 H2)
      assert titles(nil) == ~w(T1 F2)
      assert dense?(nil) and dense?(@thu) and dense?(@today)
    end

    test "a stale before_id lands it last", %{brewer: brewer, t: t} do
      # H1 is on Thursday, not today: someone else moved it.
      assert {:ok, %Task{position: 3}} =
               Tasks.move(brewery_board(), t["T1"], @today, t["H1"].id, brewer)

      assert titles(@today) == ~w(T2 T3 T1)

      assert {:ok, _} = Tasks.move(brewery_board(), t["T2"], @today, 999_999, brewer)
      assert titles(@today) == ~w(T3 T1 T2)
    end

    test "to a past day", %{brewer: brewer, t: t} do
      assert {:ok, %Task{due_on: @mon, position: 1}} =
               Tasks.move(brewery_board(), t["T1"], @mon, nil, brewer)
    end

    test "back to where it was logs nothing", %{brewer: brewer, t: t} do
      assert {:ok, _} = Tasks.move(brewery_board(), t["T2"], @today, t["T3"].id, brewer)
      assert [%Event{action: "created"}] = events(t["T2"])
    end

    test "a bad date", %{brewer: brewer, t: t} do
      assert {:error, :invalid_date} = Tasks.move(brewery_board(), t["T1"], "10/15", nil, brewer)
    end

    test "a deleted task", %{brewer: brewer, t: t} do
      {:ok, :deleted} = Tasks.delete(brewery_board(), t["T1"], brewer)
      assert {:error, :not_found} = Tasks.move(brewery_board(), t["T1"], @thu, nil, brewer)
    end

    test "locked tasks can't move; a done one can't go to Future", %{brewer: brewer, t: t} do
      {:ok, _} = Tasks.complete(brewery_board(), t["H1"], "both", brewer, @today)
      assert {:error, :locked} = Tasks.move(brewery_board(), t["H1"], @thu, nil, brewer)

      {:ok, _} = Tasks.complete(brewery_board(), t["F1"], nil, brewer, @today)
      assert {:error, :locked} = Tasks.move(brewery_board(), t["F1"], @thu, nil, brewer)

      # Done in place on its own day: it can move between days, not to Future.
      {:ok, _} = Tasks.complete(brewery_board(), t["T1"], nil, brewer, @today)
      assert {:error, :locked} = Tasks.move(brewery_board(), t["T1"], nil, nil, brewer)
      assert {:ok, %Task{due_on: @thu}} = Tasks.move(brewery_board(), t["T1"], @thu, nil, brewer)
    end

    test "two people moving the same task at once both succeed (S16)",
         %{brewer: brewer, brewer2: brewer2, t: t} do
      task = t["T2"]

      results =
        [{@thu, brewer}, {nil, brewer2}]
        |> Enum.map(fn {day, who} ->
          Elixir.Task.async(fn -> Tasks.move(brewery_board(), task, day, nil, who) end)
        end)
        |> Enum.map(&Elixir.Task.await/1)

      assert [{:ok, _}, {:ok, _}] = results

      final = Repo.get!(Task, task.id)
      assert final.due_on in [@thu, nil]
      assert dense?(@today) and dense?(@thu) and dense?(nil)
      assert titles(@today) == ~w(T1 T3)
      assert Enum.count(titles(@thu) ++ titles(nil), &(&1 == "T2")) == 1
    end
  end

  describe "move_overdue_to_today/2 (S20)" do
    setup :people

    test "appends to today oldest day first, keeping each day's order", %{brewer: brewer} do
      _own1 = add!(brewer, "Own 1", @today)
      _own2 = add!(brewer, "Own 2", @today)
      _m1 = add!(brewer, "Mon 1", @mon)
      _m2 = add!(brewer, "Mon 2", @mon)
      t1 = add!(brewer, "Tue 1", @tue)
      done = add!(brewer, "Tue done", @tue)
      {:ok, _} = Tasks.complete(brewery_board(), done, "planned_day", brewer, @today)
      _future = add!(brewer, "Future", nil)
      _later = add!(brewer, "Thu", @thu)

      assert {:ok, 3} = Tasks.move_overdue_to_today(brewery_board(), brewer, @today)

      assert titles(@today) == ["Own 1", "Own 2", "Mon 1", "Mon 2", "Tue 1"]
      assert titles(@mon) == []
      assert titles(@tue) == ["Tue done"]
      assert titles(nil) == ["Future"]
      assert dense?(@today) and dense?(@tue)

      moved = Repo.all(from e in Event, where: e.action == "moved")
      assert length(moved) == 3

      assert [%Event{detail: %{"from" => %{"due_on" => "2026-10-13"}, "to" => to}}, _] =
               events(t1)

      assert to == %{"due_on" => "2026-10-14", "position" => 5}
    end

    test "nothing overdue", %{brewer: brewer} do
      add!(brewer, "Future", nil)
      assert {:ok, 0} = Tasks.move_overdue_to_today(brewery_board(), brewer, @today)
    end
  end

  describe "complete/4 and uncomplete/2" do
    setup :people

    test "on its own day: no display needed, shown in place", %{brewer: brewer} do
      task = add!(brewer, "Package FV6", @today)
      assert {:ok, done} = Tasks.complete(brewery_board(), task, "both", brewer, @today)

      assert %Task{
               completed_on: @today,
               completed_display: "planned_day",
               completed_by_id: id
             } = done

      assert id == brewer.id
      assert done.completed_at
    end

    test "another day without a display → display_required (S8f), nothing logged",
         %{brewer: brewer} do
      task = add!(brewer, "Carb FV3", @mon)

      assert {:error, :display_required} =
               Tasks.complete(brewery_board(), task, nil, brewer, @today)

      assert {:error, :display_required} =
               Tasks.complete(brewery_board(), task, "", brewer, @today)

      refute Task.done?(Repo.get!(Task, task.id))
      assert [%Event{action: "created"}] = events(task)
    end

    test "an unknown display is a changeset error", %{brewer: brewer} do
      task = add!(brewer, "Carb FV3", @mon)

      assert {:error, %Ecto.Changeset{} = cs} =
               Tasks.complete(brewery_board(), task, "sometime", brewer, @today)

      assert %{completed_display: [_]} = errors_on(cs)
    end

    test "each display, from a past day and a future day (S8a–S8c, S8g)", %{brewer: brewer} do
      for display <- ~w(planned_day completed_day both), day <- [@mon, @thu] do
        task = add!(brewer, "#{display} #{day}", day)
        assert {:ok, done} = Tasks.complete(brewery_board(), task, display, brewer, @today)
        assert {done.due_on, done.completed_on, done.completed_display} == {day, @today, display}

        assert [%Event{action: "completed", detail: detail}, _] = events(task)

        assert detail == %{
                 "display" => display,
                 "completed_on" => "2026-10-14",
                 "due_on" => Date.to_iso8601(day)
               }
      end
    end

    test "a Future task: completed_day, and it leaves the Future list (S23g)",
         %{brewer: brewer} do
      f1 = add!(brewer, "F1", nil)
      _f2 = add!(brewer, "F2", nil)
      _f3 = add!(brewer, "F3", nil)

      assert {:ok, %Task{completed_display: "completed_day", due_on: nil}} =
               Tasks.complete(brewery_board(), f1, "planned_day", brewer, @today)

      assert titles(nil) == ~w(F2 F3)
      assert dense?(nil)

      assert {:ok, %Task{due_on: nil, position: 3, completed_at: nil}} =
               Tasks.uncomplete(brewery_board(), f1, brewer)

      assert titles(nil) == ~w(F2 F3 F1)
    end

    test "uncomplete clears all four fields; the task keeps its place (S8d)",
         %{brewer: brewer} do
      _a = add!(brewer, "A", @mon)
      task = add!(brewer, "Carb FV3", @mon)
      _c = add!(brewer, "C", @mon)
      {:ok, _} = Tasks.complete(brewery_board(), task, "both", brewer, @today)

      assert {:ok, open} = Tasks.uncomplete(brewery_board(), task, brewer)

      assert {open.completed_at, open.completed_by_id, open.completed_on, open.completed_display} ==
               {nil, nil, nil, nil}

      assert {open.due_on, open.position} == {@mon, 2}

      assert [%Event{action: "uncompleted", detail: detail}, _, _] = events(task)
      assert detail == %{"completed_on" => "2026-10-14", "display" => "both"}
    end

    test "completing twice is a no-op, logged once", %{brewer: brewer, brewer2: brewer2} do
      task = add!(brewer, "A", @today)
      {:ok, first} = Tasks.complete(brewery_board(), task, nil, brewer, @today)
      assert {:ok, second} = Tasks.complete(brewery_board(), task, nil, brewer2, @today)
      assert second.completed_by_id == brewer.id
      assert second.completed_at == first.completed_at
      assert Enum.count(events(task), &(&1.action == "completed")) == 1
    end

    test "uncompleting an open task is a no-op", %{brewer: brewer} do
      task = add!(brewer, "A", @today)
      assert {:ok, %Task{completed_at: nil}} = Tasks.uncomplete(brewery_board(), task, brewer)
      assert [%Event{action: "created"}] = events(task)
    end
  end

  describe "delete/2" do
    setup :people

    test "deletes, renumbers the day and keeps the history", %{brewer: brewer} do
      a = add!(brewer, "A", @today)
      b = add!(brewer, "Package FV6", @today)
      _c = add!(brewer, "C", @today)

      assert {:ok, :deleted} = Tasks.delete(brewery_board(), b, brewer)
      refute Repo.get(Task, b.id)
      assert titles(@today) == ~w(A C)
      assert dense?(@today)

      assert [%Event{action: "deleted", title: "Package FV6"}, %Event{action: "created"}] =
               events(b)

      assert %{events: [%Event{action: "deleted"} | _], total: 2} =
               Tasks.list_events(brewery_board(), b.id)

      assert {:error, :not_found} = Tasks.delete(brewery_board(), b, brewer)
      assert {:ok, _} = Tasks.delete(brewery_board(), a, brewer)
    end

    test "on Future renumbers the Future list", %{brewer: brewer} do
      f1 = add!(brewer, "F1", nil)
      _f2 = add!(brewer, "F2", nil)
      {:ok, _} = Tasks.delete(brewery_board(), f1, brewer)
      assert dense?(nil)
    end
  end

  describe "list_events/2" do
    setup :people

    test "newest first, paged, all or one task", %{brewer: brewer} do
      a = add!(brewer, "A", @today)
      b = add!(brewer, "B", @today)
      {:ok, _} = Tasks.complete(brewery_board(), a, nil, brewer, @today)

      assert %{events: [first | _], total: 3, page: 1} =
               Tasks.list_events(brewery_board())

      assert {first.action, first.task_id} == {"completed", a.id}
      assert first.actor.id == brewer.id

      assert %{events: [%Event{task_id: id}], total: 1} = Tasks.list_events(brewery_board(), b.id)
      assert id == b.id

      assert %{events: [], page: 2} = Tasks.list_events(brewery_board(), nil, 2)
    end

    test "names the assignees and reordered Daily items the page mentions", %{brewer: brewer} do
      task = add!(brewer, "A", @today, brewer.id)
      {:ok, _} = Tasks.update(brewery_board(), task, %{assignee_id: nil}, brewer)
      ids = Tasks.list_items(brewery_board()) |> Enum.map(& &1.id)
      {:ok, _} = Tasks.order_items(brewery_board(), Enum.reverse(ids), brewer)

      %{names: %{users: users, items: items}} =
        Tasks.list_events(brewery_board())

      assert users == %{brewer.id => brewer.name}
      assert items |> Map.keys() |> Enum.sort() == Enum.sort(ids)
    end
  end

  describe "unassign_if_ineligible/2 (S49)" do
    setup :people

    test "an active Brewery person keeps their tasks", %{brewer: brewer, mgr: mgr} do
      task = add!(brewer, "A", @today, brewer.id)
      assert :ok = Tasks.unassign_if_ineligible(brewer.id, mgr)
      assert Repo.get!(Task, task.id).assignee_id == brewer.id
    end
  end

  ## Helpers

  defp people(_ctx \\ %{}) do
    department_fixture("brewery")

    %{
      brewer: user_with_role("employee", "brewery", %{name: "Kate Brewer"}),
      brewer2: user_with_role("employee", "brewery", %{name: "Sam Brewer"}),
      mgr: user_with_role("manager", "brewery")
    }
  end

  defp add!(actor, title, due_on, assignee_id \\ nil) do
    {:ok, task} =
      Tasks.create(
        brewery_board(),
        %{title: title, due_on: due_on, assignee_id: assignee_id},
        actor
      )

    task
  end

  # A list's titles in order: a day (every task on it) or Future (open, no day).
  defp titles(day) do
    day
    |> list()
    |> Enum.map(& &1.title)
  end

  defp list(nil),
    do:
      Repo.all(
        from t in Task,
          where: is_nil(t.due_on) and is_nil(t.completed_at),
          order_by: [t.position, t.id]
      )

  defp list(day),
    do: Repo.all(from t in Task, where: t.due_on == ^day, order_by: [t.position, t.id])

  defp dense?(day),
    do: Enum.map(list(day), & &1.position) == Enum.to_list(1..length(list(day))//1)

  defp events(%Task{id: id}),
    do: Repo.all(from e in Event, where: e.task_id == ^id, order_by: [desc: e.id])
end
