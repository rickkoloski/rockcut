defmodule RockcutApiWeb.TaskBoardControllerTest do
  @moduledoc """
  D38 §3.3 / §3.6: every Brewery task board route as `brewer1`, `breweryMgr`,
  `owner`, `bartender1` (403) and a shared device (403); the 422 codes; the
  `/api/me` flag.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.TaskFixtures

  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.Tasks

  setup do
    p = personas(~w(owner breweryMgr brewer1 bartender1))
    {_device, token} = taproom_device()
    %{p: p, token: token, today: Tasks.today()}
  end

  defp add(user, attrs) do
    call(user, :post, "/api/boards/brewery/tasks", Map.merge(%{title: "Package FV6"}, attrs))
  end

  defp add!(user, attrs), do: add(user, attrs) |> json_response(201) |> Map.get("data")

  defp item_id(name),
    do: Enum.find(Tasks.list_items(brewery_board()), &(&1.name == name)).id

  defp board(user, from, to),
    do:
      call(user, :get, "/api/boards/brewery/tasks", %{from: Date.to_iso8601(from), to: to_iso(to)})

  defp to_iso(%Date{} = d), do: Date.to_iso8601(d)
  defp to_iso(s), do: s

  describe "who may use each route" do
    test "Brewery members and owners read and write; managers and owners also manage", %{
      p: p,
      today: today
    } do
      for key <- ~w(brewer1 breweryMgr owner) do
        user = p[key]
        iso = Date.to_iso8601(today)

        assert board(user, today, today).status == 200
        task = add!(user, %{due_on: iso})
        other = add!(user, %{due_on: iso})
        path = "/api/boards/brewery/tasks/#{task["id"]}"

        assert call(user, :patch, path, %{title: "Package FV7"}).status == 200

        assert call(user, :post, path <> "/move", %{due_on: iso, before_id: other["id"]}).status ==
                 200

        assert call(user, :post, path <> "/complete").status == 200
        assert call(user, :post, path <> "/uncomplete").status == 200
        assert call(user, :post, "/api/boards/brewery/tasks/move_overdue_to_today").status == 200
        assert call(user, :delete, path).status == 204

        check = "/api/boards/brewery/daily_checks/#{iso}/#{item_id("Temps")}"
        assert call(user, :put, check).status == 200
        assert call(user, :delete, check).status == 204
        assert call(user, :get, "/api/boards/brewery/daily_items").status == 200

        manager? = key != "brewer1"
        expected = if manager?, do: 200, else: 403
        assert call(user, :get, "/api/boards/brewery/tasks/history").status == expected, key

        created = call(user, :post, "/api/boards/brewery/daily_items", %{name: "Hoses #{key}"})
        assert created.status == if(manager?, do: 201, else: 403), key

        id = if manager?, do: json_response(created, 201)["data"]["id"], else: item_id("Temps")

        assert call(user, :patch, "/api/boards/brewery/daily_items/#{id}", %{
                 name: "Hoses2 #{key}"
               }).status ==
                 expected

        ids =
          Enum.map(Tasks.list_items(brewery_board()), & &1.id) |> Enum.reverse()

        assert call(user, :put, "/api/boards/brewery/daily_items/order", %{ids: ids}).status ==
                 expected

        assert call(user, :patch, "/api/boards/brewery/daily_items/#{id}", %{active: false}).status ==
                 expected
      end
    end

    test "a Taproom-only person gets 403 on every route", %{p: p, today: today} do
      owner_task = add!(p["owner"], %{due_on: Date.to_iso8601(today)})

      for {verb, path, params} <- routes(owner_task["id"], today) do
        assert call(p["bartender1"], verb, path, params).status == 403, "#{verb} #{path}"
      end
    end

    test "a shared device gets 403 on every route", %{p: p, token: token, today: today} do
      owner_task = add!(p["owner"], %{due_on: Date.to_iso8601(today)})

      for {verb, path, params} <- routes(owner_task["id"], today) do
        conn = call_device(token, verb, path, params)
        assert conn.status == 403, "#{verb} #{path}"
        assert json_response(conn, 403)["error"] == "Not available on a shared device"
      end
    end
  end

  defp routes(task_id, today) do
    iso = Date.to_iso8601(today)
    item = item_id("Temps")

    [
      {:get, "/api/boards/brewery/tasks", %{from: iso, to: iso}},
      {:get, "/api/boards/brewery/tasks/history", %{}},
      {:post, "/api/boards/brewery/tasks", %{title: "Nope"}},
      {:post, "/api/boards/brewery/tasks/move_overdue_to_today", %{}},
      {:patch, "/api/boards/brewery/tasks/#{task_id}", %{title: "Nope"}},
      {:delete, "/api/boards/brewery/tasks/#{task_id}", %{}},
      {:post, "/api/boards/brewery/tasks/#{task_id}/move", %{due_on: iso}},
      {:post, "/api/boards/brewery/tasks/#{task_id}/complete", %{}},
      {:post, "/api/boards/brewery/tasks/#{task_id}/uncomplete", %{}},
      {:put, "/api/boards/brewery/daily_checks/#{iso}/#{item}", %{}},
      {:delete, "/api/boards/brewery/daily_checks/#{iso}/#{item}", %{}},
      {:get, "/api/boards/brewery/daily_items", %{}},
      {:post, "/api/boards/brewery/daily_items", %{name: "Nope"}},
      {:put, "/api/boards/brewery/daily_items/order", %{ids: []}},
      {:patch, "/api/boards/brewery/daily_items/#{item}", %{name: "Nope"}}
    ]
  end

  describe "the board GET" do
    test "dates, keys and names in the JSON", %{p: p, today: today} do
      yesterday = Date.add(today, -1)
      brewer = p["brewer1"]

      done =
        add!(brewer, %{
          title: "Carb FV3",
          due_on: Date.to_iso8601(yesterday),
          assignee_id: brewer.id
        })

      call(brewer, :post, "/api/boards/brewery/tasks/#{done["id"]}/complete", %{display: "both"})
      open = add!(brewer, %{title: "Filter FV2 > FV3", due_on: Date.to_iso8601(today)})
      future = add!(brewer, %{title: "Clean the cold room"})

      overdue =
        add!(brewer, %{title: "Dry hop FV1", due_on: Date.to_iso8601(Date.add(today, -5))})

      data = board(brewer, yesterday, today) |> json_response(200) |> Map.get("data")
      iso_today = Date.to_iso8601(today)
      iso_yesterday = Date.to_iso8601(yesterday)

      assert %{"from" => ^iso_yesterday, "to" => ^iso_today, "today" => ^iso_today} = data
      [y, t] = data["days"]
      assert y["date"] == iso_yesterday

      assert [
               %{
                 "key" => key_y,
                 "done_on" => ^iso_today,
                 "locked" => true,
                 "assignee_name" => "Jake Brewer",
                 "completed_by_name" => "Jake Brewer",
                 "created_by_name" => "Jake Brewer"
               }
             ] = y["cards"]

      assert key_y == "#{done["id"]}:#{iso_yesterday}"

      assert Enum.map(t["cards"], & &1["key"]) == [
               "#{open["id"]}:#{iso_today}",
               "#{done["id"]}:#{iso_today}"
             ]

      assert %{"done" => 0, "total" => 4, "items" => [%{"name" => "Backups"} | _]} = t["daily"]

      assert %{"people" => [], "open_shifts" => [], "events" => [], "no_brewers" => true} =
               t["header"]

      assert [%{"key" => uk, "overdue" => true}] = data["unfinished"]
      assert uk == "#{overdue["id"]}:unfinished"
      assert [%{"key" => fk, "day" => "future", "due_on" => nil}] = data["future"]
      assert fk == "#{future["id"]}:future"
    end

    test "range errors are 422 with a code", %{p: p, today: today} do
      user = p["brewer1"]

      assert %{"error" => "range_too_long"} =
               board(user, today, Date.add(today, 31)) |> json_response(422)

      assert %{"error" => "range_too_long"} =
               board(user, today, Date.add(today, -1)) |> json_response(422)

      assert %{"error" => "invalid_date"} = board(user, today, "soon") |> json_response(422)
      assert board(user, today, Date.add(today, 30)).status == 200
    end
  end

  describe "task writes" do
    test "create validates the title and the assignee", %{p: p} do
      assert %{"errors" => %{"title" => _}} =
               add(p["brewer1"], %{title: " "}) |> json_response(422)

      assert %{"errors" => %{"assignee_id" => ["must be a Brewery member"]}} =
               add(p["brewer1"], %{assignee_id: p["bartender1"].id}) |> json_response(422)
    end

    test "complete off its own day needs a display; a moved finished task is locked", %{
      p: p,
      today: today
    } do
      user = p["brewer1"]
      task = add!(user, %{due_on: Date.to_iso8601(Date.add(today, -1))})
      path = "/api/boards/brewery/tasks/#{task["id"]}"

      assert %{"error" => "display_required", "message" => _} =
               call(user, :post, path <> "/complete") |> json_response(422)

      assert %{"data" => %{"done" => true, "completed_display" => "completed_day"}} =
               call(user, :post, path <> "/complete", %{display: "completed_day"})
               |> json_response(200)

      assert %{"error" => "locked"} =
               call(user, :post, path <> "/move", %{due_on: Date.to_iso8601(today)})
               |> json_response(422)
    end

    test "move to Future and back; move_overdue_to_today counts", %{p: p, today: today} do
      user = p["brewer1"]
      task = add!(user, %{due_on: Date.to_iso8601(Date.add(today, -2))})
      path = "/api/boards/brewery/tasks/#{task["id"]}/move"

      assert %{"data" => %{"due_on" => nil}} =
               call(user, :post, path, %{due_on: nil}) |> json_response(200)

      call(user, :post, path, %{due_on: Date.to_iso8601(Date.add(today, -2))})

      assert %{"moved" => 1} =
               call(user, :post, "/api/boards/brewery/tasks/move_overdue_to_today")
               |> json_response(200)
    end

    test "a missing task is a 404", %{p: p} do
      for {verb, suffix} <- [patch: "", delete: "", post: "/move", post: "/complete"] do
        assert %{"error" => "not_found"} =
                 call(p["brewer1"], verb, "/api/boards/brewery/tasks/999999#{suffix}", %{
                   title: "x"
                 })
                 |> json_response(404)
      end
    end

    test "history: newest first, with names, filterable to one task", %{p: p} do
      a = add!(p["brewer1"], %{title: "First"})
      _b = add!(p["breweryMgr"], %{title: "Second", assignee_id: p["brewer1"].id})
      call(p["brewer1"], :delete, "/api/boards/brewery/tasks/#{a["id"]}")

      body =
        call(p["breweryMgr"], :get, "/api/boards/brewery/tasks/history") |> json_response(200)

      assert %{"page" => 1, "total" => 3, "per_page" => 50} = body

      assert [
               %{"action" => "deleted", "title" => "First", "actor_name" => "Jake Brewer"},
               %{"action" => "created", "title" => "Second", "actor_name" => "Morgan Mash"},
               %{"action" => "created", "on_shared_device" => false}
             ] = body["data"]

      # The assignee in "Second"'s detail, by name.
      assert body["names"] == %{
               "users" => %{"#{p["brewer1"].id}" => "Jake Brewer"},
               "items" => %{}
             }

      assert %{"data" => [%{"action" => "deleted"}, %{"action" => "created"}], "total" => 2} =
               call(p["owner"], :get, "/api/boards/brewery/tasks/history", %{task_id: a["id"]})
               |> json_response(200)
    end
  end

  describe "the Daily card" do
    test "a future tick, a retired item, the cap, a missing item", %{p: p, today: today} do
      brewer = p["brewer1"]
      mgr = p["breweryMgr"]
      temps = item_id("Temps")
      future = "/api/boards/brewery/daily_checks/#{Date.to_iso8601(Date.add(today, 1))}/#{temps}"

      assert %{"error" => "future_day"} = call(brewer, :put, future) |> json_response(422)

      assert %{"data" => %{"active" => false}} =
               call(mgr, :patch, "/api/boards/brewery/daily_items/#{temps}", %{active: false})
               |> json_response(200)

      assert %{"error" => "retired"} =
               call(
                 brewer,
                 :put,
                 "/api/boards/brewery/daily_checks/#{Date.to_iso8601(today)}/#{temps}"
               )
               |> json_response(422)

      for n <- 1..9, do: call(mgr, :post, "/api/boards/brewery/daily_items", %{name: "Item #{n}"})

      assert %{"error" => "too_many_items"} =
               call(mgr, :post, "/api/boards/brewery/daily_items", %{name: "One more"})
               |> json_response(422)

      assert %{"errors" => %{"name" => ["Already on the list"]}} =
               call(mgr, :patch, "/api/boards/brewery/daily_items/#{item_id("Backups")}", %{
                 name: "item 1"
               })
               |> json_response(422)

      assert call(
               brewer,
               :put,
               "/api/boards/brewery/daily_checks/#{Date.to_iso8601(today)}/999999"
             ).status ==
               404

      assert %{"error" => "invalid_order"} =
               call(mgr, :put, "/api/boards/brewery/daily_items/order", %{ids: [1]})
               |> json_response(422)
    end

    test "ticking a day before the item was added is a 422 (G4)", %{p: p, today: today} do
      # The defaults have been on the card all year.
      RockcutApi.Repo.update_all(RockcutApi.Tasks.DailyItem,
        set: [inserted_at: ~U[2026-01-01 12:00:00Z]]
      )

      created =
        call(p["breweryMgr"], :post, "/api/boards/brewery/daily_items", %{name: "DO"})
        |> json_response(201)

      yesterday = Date.to_iso8601(Date.add(today, -1))
      check = "/api/boards/brewery/daily_checks/#{yesterday}/#{created["data"]["id"]}"

      assert %{"error" => "not_yet_added", "message" => _} =
               call(p["brewer1"], :put, check) |> json_response(422)

      assert %{"done" => 0, "total" => 4, "items" => items} =
               board(p["brewer1"], Date.add(today, -1), Date.add(today, -1))
               |> json_response(200)
               |> get_in(["data", "days", Access.at(0), "daily"])

      refute Enum.any?(items, &(&1["name"] == "DO"))
    end

    test "un-retiring an item is a 422 and leaves it retired (G3)", %{p: p} do
      mgr = p["breweryMgr"]
      temps = item_id("Temps")

      call(mgr, :patch, "/api/boards/brewery/daily_items/#{temps}", %{active: false})
      |> json_response(200)

      assert %{"error" => "retired"} =
               call(mgr, :patch, "/api/boards/brewery/daily_items/#{temps}", %{active: true})
               |> json_response(422)

      refute Tasks.get_item(brewery_board(), temps).active
      refute Enum.any?(Tasks.list_items(brewery_board()), &(&1.id == temps))
    end
  end

  test "/api/me brewery_tasks_manage: owners and Brewery managers", %{p: p} do
    flags =
      for key <- ~w(owner breweryMgr brewer1 bartender1),
          into: %{},
          do: {key, (call(p[key], :get, "/api/me") |> json_response(200))["brewery_tasks_manage"]}

    assert flags == %{
             "owner" => true,
             "breweryMgr" => true,
             "brewer1" => false,
             "bartender1" => false
           }
  end
end
