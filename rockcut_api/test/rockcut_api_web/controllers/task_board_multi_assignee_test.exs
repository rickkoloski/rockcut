defmodule RockcutApiWeb.TaskBoardMultiAssigneeTest do
  @moduledoc """
  D53 Part 1 (§3.3, S216, S220, S221, S222), through the API: `assignees` in
  the JSON beside the old fields, `assignee_ids` writes, a lone `assignee_id`
  from a UI tab on the old version, linked tasks with one person at most, the
  shared tablet with a staff code, and the route matrix.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.ProductionFixtures
  import RockcutApi.SchedulingFixtures
  import Phoenix.ConnTest

  alias RockcutApi.{AccountsFixtures, Notifications, Reminders, Repo, StaffCodes, Tasks}
  alias RockcutApi.Production.Step
  alias RockcutApi.Scheduling.Recurrence
  alias RockcutApi.Tasks.{Assignees, Task}

  setup do
    p = personas(~w(owner breweryMgr brewer1 brewer2 floater barMgr bartender1))
    {:ok, _} = StaffCodes.set(p["brewer1"], "1111", p["breweryMgr"])
    %{p: p}
  end

  defp today, do: Date.to_iso8601(Tasks.today())

  defp add(who, attrs, board \\ "brewery") do
    call(who, :post, "/api/boards/#{board}/tasks", Map.merge(%{title: "Keg Wash"}, attrs))
  end

  defp people(task), do: Enum.map(task["assignees"], & &1["id"])

  describe "the JSON and writes" do
    test "S216: two people persist, with the old fields on the first", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}

      %{"data" => task} =
        add(b1, %{due_on: today(), assignee_ids: [b2.id, b1.id]}) |> json_response(201)

      assert task["assignees"] == [
               %{"id" => b2.id, "name" => b2.name},
               %{"id" => b1.id, "name" => b1.name}
             ]

      assert task["assignee_id"] == b2.id
      assert task["assignee_name"] == b2.name

      %{"data" => %{"days" => [%{"cards" => [card]}]}} =
        call(b1, :get, "/api/boards/brewery/tasks", %{from: today(), to: today()})
        |> json_response(200)

      assert people(card) == [b2.id, b1.id]
      assert card["assignee_id"] == b2.id
      assert card["assignee_name"] == b2.name
    end

    test "PATCH assignee_ids; [] unassigns; the old fields follow", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}
      %{"data" => %{"id" => id}} = add(b1, %{}) |> json_response(201)
      url = "/api/boards/brewery/tasks/#{id}"

      %{"data" => task} =
        call(b1, :patch, url, %{assignee_ids: [b1.id, b2.id]}) |> json_response(200)

      assert people(task) == [b1.id, b2.id]
      assert task["assignee_id"] == b1.id

      %{"data" => task} = call(b1, :patch, url, %{assignee_ids: []}) |> json_response(200)
      assert task["assignees"] == []
      assert task["assignee_id"] == nil
      assert task["assignee_name"] == nil
    end

    test "the same people in another order changes nothing (lead decision 3)", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}

      %{"data" => %{"id" => id}} =
        add(b1, %{assignee_ids: [b1.id, b2.id]}) |> json_response(201)

      %{"data" => task} =
        call(b1, :patch, "/api/boards/brewery/tasks/#{id}", %{assignee_ids: [b2.id, b1.id]})
        |> json_response(200)

      assert people(task) == [b1.id, b2.id]
      assert task["assignee_id"] == b1.id

      history =
        call(p["breweryMgr"], :get, "/api/boards/brewery/tasks/history", %{task_id: id})
        |> json_response(200)

      assert Enum.map(history["data"], & &1["action"]) == ["created"]
    end

    test "a series occurrence given another order needs no scope", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}

      %{"data" => task} =
        add(b1, %{
          due_on: today(),
          repeat: "weekly",
          repeat_weekdays: [Date.day_of_week(Tasks.today())],
          assignee_ids: [b1.id, b2.id]
        })
        |> json_response(201)

      %{"data" => same} =
        call(b1, :patch, "/api/boards/brewery/tasks/#{task["id"]}", %{
          assignee_ids: [b2.id, b1.id]
        })
        |> json_response(200)

      refute same["series_exception"]
      assert people(same) == [b1.id, b2.id]
    end

    test "422 names the person who can't be assigned", %{p: p} do
      bartender = p["bartender1"]

      assert %{"errors" => %{"assignee_ids" => [message]}} =
               add(p["brewer1"], %{assignee_ids: [p["brewer2"].id, bartender.id]})
               |> json_response(422)

      assert message == "#{bartender.name} must be a Brewery member"
    end

    test "422 on a device and on ids that aren't ids", %{p: p} do
      device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse tablet"})

      assert %{"errors" => %{"assignee_ids" => ["Brewhouse tablet must be a Brewery member"]}} =
               add(p["brewer1"], %{assignee_ids: [device.id]}) |> json_response(422)

      assert %{"errors" => %{"assignee_ids" => ["is invalid"]}} =
               add(p["brewer1"], %{assignee_ids: ["x"]}) |> json_response(422)

      assert %{"errors" => %{"assignee_ids" => ["is invalid"]}} =
               add(p["brewer1"], %{assignee_ids: p["brewer2"].id}) |> json_response(422)
    end

    test "S219: a series carries the list, and the series read shows it", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}

      %{"data" => task} =
        add(b1, %{
          due_on: today(),
          repeat: "weekly",
          repeat_weekdays: [Date.day_of_week(Tasks.today())],
          assignee_ids: [b1.id, b2.id]
        })
        |> json_response(201)

      assert people(task) == [b1.id, b2.id]

      %{"data" => series} =
        call(b1, :get, "/api/boards/brewery/tasks/#{task["id"]}/series") |> json_response(200)

      assert people(series) == [b1.id, b2.id]
      assert series["assignee_id"] == b1.id
    end

    test "S216: History names both", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}
      %{"data" => %{"id" => id}} = add(b1, %{}) |> json_response(201)

      call(b1, :patch, "/api/boards/brewery/tasks/#{id}", %{assignee_ids: [b1.id, b2.id]})
      |> json_response(200)

      body =
        call(p["breweryMgr"], :get, "/api/boards/brewery/tasks/history", %{task_id: id})
        |> json_response(200)

      assert %{"action" => "assigned", "detail" => %{"from" => [], "to" => to}} =
               hd(body["data"])

      assert to == [b1.id, b2.id]
      assert body["names"]["users"][to_string(b1.id)] == b1.name
      assert body["names"]["users"][to_string(b2.id)] == b2.name
    end
  end

  describe "QA gap 3: how many people one write can name" do
    defp unused_ids(n), do: Enum.map(1..n, &(5_000_000 + &1))

    defp brewers(n) do
      for i <- 1..n,
          do: AccountsFixtures.user_with_role("employee", "brewery", %{name: "Brewer #{i}"})
    end

    test "100 people is accepted, and all 100 are on the task", %{p: p} do
      ids = brewers(100) |> Enum.map(& &1.id)

      %{"data" => task} = add(p["brewer1"], %{assignee_ids: ids}) |> json_response(201)

      assert people(task) == ids
    end

    test "101 distinct ids is one message, for POST and PATCH", %{p: p} do
      message = ["A task can have at most 100 people"]
      ids = unused_ids(101)

      assert %{"errors" => %{"assignee_ids" => ^message}} =
               add(p["brewer1"], %{assignee_ids: ids}) |> json_response(422)

      %{"data" => %{"id" => id}} = add(p["brewer1"], %{}) |> json_response(201)

      assert %{"errors" => %{"assignee_ids" => ^message}} =
               call(p["brewer1"], :patch, "/api/boards/brewery/tasks/#{id}", %{assignee_ids: ids})
               |> json_response(422)
    end

    test "30,000 distinct ids is the same 422, quickly, on one-offs and repeats", %{p: p} do
      ids = unused_ids(30_000)
      message = ["A task can have at most 100 people"]
      %{"data" => %{"id" => id}} = add(p["brewer1"], %{}) |> json_response(201)

      %{"data" => %{"id" => occurrence}} =
        add(p["brewer1"], %{
          due_on: today(),
          repeat: "weekly",
          repeat_weekdays: [1, 2, 3, 4, 5, 6, 7]
        })
        |> json_response(201)

      for {url, extra} <- [
            {"/api/boards/brewery/tasks/#{id}", %{}},
            {"/api/boards/brewery/tasks/#{occurrence}", %{scope: "this"}},
            {"/api/boards/brewery/tasks/#{occurrence}", %{scope: "following"}},
            {"/api/boards/brewery/tasks/#{occurrence}",
             %{scope: "following", repeat: "weekly", repeat_weekdays: [1]}}
          ] do
        {micros, conn} =
          :timer.tc(fn ->
            call(p["brewer1"], :patch, url, Map.put(extra, :assignee_ids, ids))
          end)

        assert %{"errors" => %{"assignee_ids" => ^message}} = json_response(conn, 422)
        # It was over 15 s (and a 500) when each id was looked up.
        assert micros < 5_000_000
      end
    end

    test "copies of one id count once", %{p: p} do
      b2 = p["brewer2"]
      ids = List.duplicate(b2.id, 30_000)

      %{"data" => task} = add(p["brewer1"], %{assignee_ids: ids}) |> json_response(201)
      assert people(task) == [b2.id]
    end

    test "below the cap: five refusals by name, then one count", %{p: p} do
      ids = unused_ids(100)

      assert %{"errors" => %{"assignee_ids" => messages}} =
               add(p["brewer1"], %{assignee_ids: ids}) |> json_response(422)

      assert messages ==
               List.duplicate("That person must be a Brewery member", 5) ++
                 ["95 more can't be assigned"]
    end

    test "up to five are all named", %{p: p} do
      ids = unused_ids(5)

      assert %{"errors" => %{"assignee_ids" => messages}} =
               add(p["brewer1"], %{assignee_ids: ids}) |> json_response(422)

      assert messages == List.duplicate("That person must be a Brewery member", 5)
    end
  end

  describe "a UI tab on the old version (lone assignee_id)" do
    test "writes it and reads it back as before", %{p: p} do
      b2 = p["brewer2"]

      %{"data" => task} = add(p["brewer1"], %{assignee_id: b2.id}) |> json_response(201)
      assert {task["assignee_id"], task["assignee_name"]} == {b2.id, b2.name}
      assert people(task) == [b2.id]

      %{"data" => task} =
        call(p["brewer1"], :patch, "/api/boards/brewery/tasks/#{task["id"]}", %{assignee_id: nil})
        |> json_response(200)

      assert {task["assignee_id"], task["assignees"]} == {nil, []}
    end

    test "means [id], so it replaces a longer list (§3.3)", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}

      %{"data" => %{"id" => id}} =
        add(b1, %{assignee_ids: [b2.id, b1.id]}) |> json_response(201)

      %{"data" => task} =
        call(b1, :patch, "/api/boards/brewery/tasks/#{id}", %{assignee_id: b2.id})
        |> json_response(200)

      assert people(task) == [b2.id]
    end
  end

  describe "linked tasks (S220)" do
    setup %{p: p} do
      fv4 = tank!("FV4")

      %{"data" => %{"batches" => [%{"id" => batch_id}]}} =
        call(p["brewer1"], :post, "/api/production/batches", %{
          brand_id: brand!("Galactic").id,
          template_id: ale_template!().id,
          brew_on: Date.to_iso8601(Date.add(Tasks.today(), 2)),
          volume_bbl: "20",
          tank_ids: [fv4.id]
        })
        |> json_response(201)

      step = named(Repo.get!(RockcutApi.Brewing.Batch, batch_id), "FDH")
      %{step: step, task: Repo.get_by!(Task, production_step_id: step.id)}
    end

    test "two people → 422; nothing changes", %{p: p, step: step, task: task} do
      body =
        call(p["brewer1"], :patch, "/api/boards/brewery/tasks/#{task.id}", %{
          assignee_ids: [p["brewer1"].id, p["brewer2"].id]
        })
        |> json_response(422)

      assert body["error"] == "linked_task_assignees"
      assert Repo.get!(Step, step.id).assignee_id == nil
      assert Assignees.ids(task) == []
    end

    test "one person goes to the step, and the task follows", %{p: p, step: step, task: task} do
      b2 = p["brewer2"]

      %{"data" => updated} =
        call(p["brewer1"], :patch, "/api/boards/brewery/tasks/#{task.id}", %{
          assignee_ids: [b2.id]
        })
        |> json_response(200)

      assert Repo.get!(Step, step.id).assignee_id == b2.id
      assert people(updated) == [b2.id]
      assert updated["assignee_id"] == b2.id
    end

    test "a lone assignee_id too; [] clears the step", %{p: p, step: step, task: task} do
      b2 = p["brewer2"]
      url = "/api/boards/brewery/tasks/#{task.id}"

      call(p["brewer1"], :patch, url, %{assignee_id: b2.id}) |> json_response(200)
      assert Repo.get!(Step, step.id).assignee_id == b2.id
      assert Assignees.ids(task) == [b2.id]

      call(p["brewer1"], :patch, url, %{assignee_ids: []}) |> json_response(200)
      assert Repo.get!(Step, step.id).assignee_id == nil
      assert Assignees.ids(task) == []
      assert Repo.get!(Task, task.id).assignee_id == nil
    end

    test "a change on the schedule reaches the task's list", %{p: p, step: step, task: task} do
      b2 = p["brewer2"]

      call(p["brewer1"], :post, "/api/production/steps/assign", %{
        ids: [step.id],
        assignee_id: b2.id
      })
      |> json_response(200)

      assert Assignees.ids(task) == [b2.id]
      assert Repo.get!(Task, task.id).assignee_id == b2.id
    end

    test "leaving the Brewery clears the step and the task", %{p: p, step: step, task: task} do
      floater = p["floater"]

      call(p["brewer1"], :post, "/api/production/steps/assign", %{
        ids: [step.id],
        assignee_id: floater.id
      })
      |> json_response(200)

      {:ok, _} = RockcutApi.Accounts.set_memberships(floater, [], p["breweryMgr"])

      assert Repo.get!(Step, step.id).assignee_id == nil
      assert Assignees.ids(task) == []
    end

    test "a tablet is refused, whatever it sends", %{p: p, task: task} do
      device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse tablet"})
      token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

      body =
        call_device(token, :patch, "/api/boards/brewery/tasks/#{task.id}", %{
          staff_code: "1111",
          assignee_ids: [p["brewer1"].id]
        })
        |> json_response(403)

      assert body["error"] == "linked_task_device"
    end
  end

  describe "a shared tablet with a staff code (S222)" do
    setup do
      device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse tablet"})
      %{token: AccountsFixtures.device_token_fixture(device, "Brewhouse Tab"), device: device}
    end

    test "sets several people; History names the acting person", %{p: p, token: token} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}

      body =
        call_device(token, :post, "/api/boards/brewery/tasks", %{
          title: "Keg Wash",
          staff_code: "1111"
        })
        |> json_response(201)

      id = body["data"]["id"]

      body =
        call_device(token, :patch, "/api/boards/brewery/tasks/#{id}", %{
          staff_code: "1111",
          assignee_ids: [b1.id, b2.id]
        })
        |> json_response(200)

      assert people(body["data"]) == [b1.id, b2.id]
      assert body["recorded_as"] == b1.name

      history =
        call(p["breweryMgr"], :get, "/api/boards/brewery/tasks/history", %{task_id: id})
        |> json_response(200)

      assert %{"action" => "assigned", "actor_id" => actor, "on_shared_device" => true} =
               hd(history["data"])

      assert actor == b1.id
    end

    test "without a code it's refused and nothing changes", %{p: p, token: token} do
      %{"data" => %{"id" => id}} = add(p["brewer1"], %{}) |> json_response(201)

      assert %{"error" => "staff_code_required"} =
               call_device(token, :patch, "/api/boards/brewery/tasks/#{id}", %{
                 assignee_ids: [p["brewer1"].id]
               })
               |> json_response(422)

      assert Assignees.ids(%Task{id: id}) == []
    end

    test "the JSON it reads has no emails", %{p: p, token: token} do
      add(p["brewer1"], %{due_on: today(), assignee_ids: [p["brewer2"].id]}) |> json_response(201)

      body =
        call_device(token, :get, "/api/boards/brewery/tasks", %{from: today(), to: today()})
        |> json_response(200)

      [%{"cards" => [card]}] = body["data"]["days"]
      assert card["assignees"] == [%{"id" => p["brewer2"].id, "name" => p["brewer2"].name}]
    end
  end

  describe "the route matrix" do
    test "someone outside the department: 403, nothing changes", %{p: p} do
      %{"data" => %{"id" => id}} = add(p["brewer1"], %{}) |> json_response(201)

      call(p["bartender1"], :patch, "/api/boards/brewery/tasks/#{id}", %{
        assignee_ids: [p["bartender1"].id]
      })
      |> json_response(403)

      add(p["bartender1"], %{assignee_ids: [p["brewer1"].id]}) |> json_response(403)
      assert Assignees.ids(%Task{id: id}) == []
    end

    test "another board's task id: 404", %{p: p} do
      %{"data" => %{"id" => id}} = add(p["brewer1"], %{}) |> json_response(201)

      call(p["barMgr"], :patch, "/api/boards/bar/tasks/#{id}", %{
        assignee_ids: [p["bartender1"].id]
      })
      |> json_response(404)
    end

    test "a tablet on another board: 403", %{p: p} do
      device = AccountsFixtures.device_fixture(%{home: "bar", name: "Taproom tablet"})
      token = AccountsFixtures.device_token_fixture(device, "Taproom Tab")

      call_device(token, :post, "/api/boards/brewery/tasks", %{
        title: "x",
        staff_code: "1111",
        assignee_ids: [p["brewer1"].id]
      })
      |> json_response(403)
    end
  end

  describe "the Brewery shift-end push (S221)" do
    defp at(day, h), do: Recurrence.local_to_utc(day, Time.new!(h, 0, 0))

    defp push_to(user),
      do: Notifications.list(user) |> Enum.filter(&(&1.event == "task_shift_end"))

    test "each person on a shared task hears once, and it's theirs", %{p: p} do
      {b1, b2} = {p["brewer1"], p["brewer2"]}
      day = Tasks.today()
      depts = departments()

      for who <- [b1, b2] do
        shift_fixture(%{
          department: depts["brewery"],
          status: "published",
          assignee_id: who.id,
          starts_at: at(day, 7),
          ends_at: at(day, 15)
        })
      end

      add(b1, %{title: "Shared", due_on: today(), assignee_ids: [b1.id, b2.id]})
      |> json_response(201)

      add(b1, %{title: "Theirs", due_on: today(), assignee_ids: [p["floater"].id]})
      |> json_response(201)

      # 2:02 p.m., inside the hour before the shifts end.
      now = DateTime.add(at(day, 14), 120)
      Reminders.run_shift_end(now)
      Reminders.run_shift_end(now)

      initials =
        p["floater"].name
        |> String.split()
        |> then(&[hd(&1), List.last(&1)])
        |> Enum.map_join(&String.first/1)

      for who <- [b1, b2] do
        assert [%{body: body}] = push_to(who)
        assert body == "Shared, Theirs (#{initials})"
      end
    end
  end
end
