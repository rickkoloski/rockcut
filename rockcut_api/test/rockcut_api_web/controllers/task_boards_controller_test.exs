defmodule RockcutApiWeb.TaskBoardsControllerTest do
  @moduledoc """
  D41 (plan step 3) through the API: `/api/boards/:dept` for every assignable
  department, 404 for `other` and unknown keys, the department's members
  only, another board's ids 404 (S115), and `/api/me`'s `task_boards`.
  """
  use RockcutApiWeb.ConnCase

  import Phoenix.ConnTest
  import RockcutApi.PersonaFixtures
  import RockcutApi.TaskFixtures

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Accounts.Department
  alias RockcutApi.Tasks.{DailyCheck, DailyItem, Task}

  setup do
    p = personas()
    # Named as on a real DB (D32 renamed Bar to Taproom).
    task_board("bar") |> Ecto.Changeset.change(name: "Taproom") |> Repo.update!()
    %{p: p, today: Tasks.today()}
  end

  defp create!(user, dept, attrs) do
    call(user, :post, "/api/boards/#{dept}/tasks", attrs) |> json_response(201) |> Map.get("data")
  end

  describe "the board in the path" do
    test "every assignable department has a board; other and unknown keys are 404", %{p: p} do
      for key <- ~w(brewery bar office sales),
          do: assert(call(p["owner"], :get, "/api/boards/#{key}/daily_items").status == 200, key)

      for key <- ~w(other nope Brewery),
          path <- ["/tasks", "/tasks/history", "/daily_items", "/tasks/1/series"] do
        conn = call(p["owner"], :get, "/api/boards/#{key}#{path}")
        assert conn.status == 404, "#{key}#{path}"
        assert %{"error" => "not_found"} = json_response(conn, 404)
      end

      assert call(p["owner"], :post, "/api/boards/other/tasks", %{title: "x"}).status == 404
      refute Repo.exists?(Task)
    end

    test "S102, S114: a board's routes are its members' (bartender1 on the Brewery, noDept anywhere: 403)",
         %{p: p, today: today} do
      range = %{from: Date.to_iso8601(today), to: Date.to_iso8601(today)}
      assert call(p["bartender1"], :get, "/api/boards/bar/tasks", range).status == 200
      assert call(p["bartender1"], :get, "/api/boards/brewery/tasks", range).status == 403

      assert call(p["bartender1"], :post, "/api/boards/brewery/tasks", %{title: "x"}).status ==
               403

      for key <- ~w(brewery bar office sales),
          do: assert(call(p["noDept"], :get, "/api/boards/#{key}/tasks", range).status == 403)

      assert call(p["office1"], :post, "/api/boards/office/tasks", %{title: "Payroll"}).status ==
               201
    end

    test "S109, S110: History and Daily items are the board's managers'", %{p: p} do
      assert call(p["breweryMgr"], :get, "/api/boards/bar/tasks/history").status == 403
      assert call(p["barMgr"], :get, "/api/boards/bar/tasks/history").status == 200
      # splitRole: Taproom manager, Brewery employee.
      assert call(p["splitRole"], :get, "/api/boards/bar/tasks/history").status == 200
      assert call(p["splitRole"], :get, "/api/boards/brewery/tasks/history").status == 403

      assert call(p["splitRole"], :post, "/api/boards/bar/daily_items", %{name: "Lines cleaned"}).status ==
               201

      assert call(p["splitRole"], :post, "/api/boards/brewery/daily_items", %{name: "Hoses"}).status ==
               403
    end
  end

  describe "S115: another board's id is 404, and nothing changes" do
    setup %{p: p, today: today} do
      task =
        create!(p["brewer1"], "brewery", %{title: "Keg Wash", due_on: Date.to_iso8601(today)})

      item = Repo.get_by!(DailyItem, department_id: brewery_board().id, name: "Temps")
      %{task: task, item: item}
    end

    test "every task route, for anyone who may use both boards (a member of both, an owner)",
         %{p: p, task: task, today: today} do
      before = Repo.get!(Task, task["id"])
      tomorrow = Date.to_iso8601(Date.add(today, 1))

      routes = [
        {:patch, "", %{title: "Hijacked", scope: "following"}},
        {:delete, "", %{}},
        {:post, "/move", %{due_on: tomorrow}},
        {:post, "/complete", %{display: "planned_day"}},
        {:post, "/uncomplete", %{}},
        {:get, "/series", %{}},
        {:post, "/stop_repeating", %{}}
      ]

      for who <- ~w(floater owner), {verb, suffix, params} <- routes do
        conn = call(p[who], verb, "/api/boards/bar/tasks/#{task["id"]}#{suffix}", params)
        assert conn.status == 404, "#{who} #{verb} #{suffix}"
        assert %{"error" => "not_found"} = json_response(conn, 404)
      end

      # Someone outside the Taproom is refused before the id is looked at
      # (D38 S39: 403 on every route).
      for {verb, suffix, params} <- routes do
        conn = call(p["brewer1"], verb, "/api/boards/bar/tasks/#{task["id"]}#{suffix}", params)
        assert conn.status == 403, "brewer1 #{verb} #{suffix}"
      end

      assert Repo.get!(Task, task["id"]) == before

      # History on the Taproom board doesn't show it either.
      assert %{"data" => [], "total" => 0} =
               call(p["owner"], :get, "/api/boards/bar/tasks/history", %{task_id: task["id"]})
               |> json_response(200)
    end

    test "a deleted Brewery task is 410 on its board, 404 on another", %{p: p, task: task} do
      assert call(p["brewer1"], :delete, "/api/boards/brewery/tasks/#{task["id"]}").status == 204
      path = "/tasks/#{task["id"]}"
      assert call(p["owner"], :patch, "/api/boards/brewery" <> path, %{title: "x"}).status == 410
      assert call(p["owner"], :patch, "/api/boards/bar" <> path, %{title: "x"}).status == 404
    end

    test "every Daily item route", %{p: p, item: item, today: today} do
      day = Date.to_iso8601(today)

      # Each route for people allowed it on the Taproom board: checks for any
      # member, the items for its managers (splitRole manages the Taproom).
      routes = [
        {~w(floater owner), :put, "/daily_checks/#{day}/#{item.id}", %{}},
        {~w(floater owner), :delete, "/daily_checks/#{day}/#{item.id}", %{}},
        {~w(splitRole owner), :patch, "/daily_items/#{item.id}", %{name: "Hijacked"}},
        {~w(splitRole owner), :patch, "/daily_items/#{item.id}", %{active: false}},
        {~w(splitRole owner), :post, "/daily_items/#{item.id}/restore", %{}}
      ]

      for {people, verb, path, params} <- routes, who <- people do
        conn = call(p[who], verb, "/api/boards/bar" <> path, params)
        assert conn.status == 404, "#{who} #{verb} #{path}"
      end

      assert Repo.reload!(item) == item
      refute Repo.exists?(DailyCheck)

      # Its id in another board's order is just a wrong list.
      assert call(p["owner"], :put, "/api/boards/bar/daily_items/order", %{ids: [item.id]}).status ==
               422
    end
  end

  describe "S105: the assignee is the board's department's" do
    test "barMgr can assign bartender1 and owners on the Taproom board, not brewer1", %{p: p} do
      ok = create!(p["barMgr"], "bar", %{title: "Lines", assignee_id: p["bartender1"].id})
      assert ok["assignee_id"] == p["bartender1"].id
      assert create!(p["barMgr"], "bar", %{title: "Kegs", assignee_id: p["owner"].id})

      conn =
        call(p["barMgr"], :post, "/api/boards/bar/tasks", %{
          title: "x",
          assignee_id: p["brewer1"].id
        })

      assert %{"errors" => %{"assignee_id" => ["must be a Taproom member"]}} =
               json_response(conn, 422)

      conn =
        call(p["barMgr"], :patch, "/api/boards/bar/tasks/#{ok["id"]}", %{
          assignee_id: p["brewer1"].id
        })

      assert %{"errors" => %{"assignee_id" => ["must be a Taproom member"]}} =
               json_response(conn, 422)

      assert Repo.get!(Task, ok["id"]).assignee_id == p["bartender1"].id
    end
  end

  describe "S108: History is per board" do
    test "barMgr sees only Taproom events; the owner sees each board's from that board",
         %{p: p, today: today} do
      day = Date.to_iso8601(today)
      pour = create!(p["bartender1"], "bar", %{title: "Clean lines", due_on: day})
      brew = create!(p["brewer1"], "brewery", %{title: "Keg Wash", due_on: day})

      ids = fn who, key ->
        call(p[who], :get, "/api/boards/#{key}/tasks/history")
        |> json_response(200)
        |> Map.get("data")
        |> Enum.map(& &1["task_id"])
      end

      assert ids.("barMgr", "bar") == [pour["id"]]
      assert ids.("owner", "bar") == [pour["id"]]
      assert ids.("owner", "brewery") == [brew["id"]]
    end
  end

  describe "the All departments view, /api/boards/all/tasks (S118, S120)" do
    defp range(from, to), do: %{from: Date.to_iso8601(from), to: Date.to_iso8601(to)}

    test "S118: the owner gets every board's cards, tagged, in department order; Daily counts only where a board has items",
         %{p: p, today: today} do
      tomorrow = Date.add(today, 1)
      pour = create!(p["bartender1"], "bar", %{title: "[TEST-TEMP] Clean lines", due_on: today})
      brew = create!(p["brewer1"], "brewery", %{title: "[TEST-TEMP] Keg Wash", due_on: today})

      payroll =
        create!(p["office1"], "office", %{title: "[TEST-TEMP] Payroll", due_on: tomorrow})

      co2 = create!(p["bartender1"], "bar", %{title: "[TEST-TEMP] Order CO2"})

      body =
        call(p["owner"], :get, "/api/boards/all/tasks", range(today, tomorrow))
        |> json_response(200)
        |> Map.fetch!("data")

      [d1, d2] = body["days"]
      cards = fn day -> Enum.map(day["cards"], &{&1["department"], &1["id"]}) end

      assert cards.(d1) == [{"brewery", brew["id"]}, {"bar", pour["id"]}]
      assert cards.(d2) == [{"office", payroll["id"]}]
      assert Enum.map(body["future"], &{&1["department"], &1["id"]}) == [{"bar", co2["id"]}]
      assert body["unfinished"] == []

      # The Brewery has its four Daily items; the other boards have none.
      assert d1["daily_counts"] == [%{"department" => "brewery", "done" => 0, "total" => 4}]
      assert Map.keys(d1) |> Enum.sort() == ~w(cards daily_counts date)

      assert %{"key" => _, "title" => "[TEST-TEMP] Keg Wash", "assignee_name" => _} =
               hd(d1["cards"])
    end

    test "S120: everyone but owners is 403, devices included", %{p: p, today: today} do
      assert call(p["owner2"], :get, "/api/boards/all/tasks", range(today, today)).status == 200

      for who <- ~w(breweryMgr floater noDept barMgr dualMgr splitRole brewer1),
          do:
            assert(
              call(p[who], :get, "/api/boards/all/tasks", range(today, today)).status == 403,
              who
            )

      {_device, token} = taproom_device()

      assert call_device(token, :get, "/api/boards/all/tasks", range(today, today)).status ==
               403
    end

    test "every other route under all is 404: no writes, no History", %{p: p, today: today} do
      fill = fn path ->
        path
        |> String.replace(":dept", "all")
        |> String.replace(":on_date", Date.to_iso8601(today))
        |> String.replace(~r/:\w+/, "1")
      end

      routes =
        for r <- RockcutApiWeb.Router.__routes__(),
            String.starts_with?(r.path, "/api/boards/:dept"),
            do: {r.verb, fill.(r.path)}

      assert length(routes) == 18

      for {verb, path} <- routes, {verb, path} != {:get, "/api/boards/all/tasks"} do
        conn = call(p["owner"], verb, path, %{title: "x", name: "x", ids: []})
        assert conn.status == 404, "#{verb} #{path}"
      end

      refute Repo.exists?(Task)
    end

    test "the 31-day limit and bad dates, as on a board", %{p: p, today: today} do
      assert call(p["owner"], :get, "/api/boards/all/tasks", range(today, Date.add(today, 30))).status ==
               200

      for params <- [range(today, Date.add(today, 31)), %{from: "nope", to: "x"}, %{}] do
        all = call(p["owner"], :get, "/api/boards/all/tasks", params)
        board = call(p["owner"], :get, "/api/boards/bar/tasks", params)
        assert {all.status, all.resp_body} == {board.status, board.resp_body}
        assert all.status in [400, 422]
      end
    end
  end

  describe "/api/me task_boards" do
    defp boards(user),
      do:
        call(user, :get, "/api/me")
        |> json_response(200)
        |> Map.take(~w(task_boards))

    test "floater, splitRole, dualMgr, owner and noDept; all for owners only", %{p: p} do
      depts = Map.new(Repo.all(Department), &{&1.key, &1})

      entry = fn key, manage ->
        %{
          "key" => key,
          "name" => depts[key].name,
          "color" => depts[key].color,
          "manage" => manage
        }
      end

      assert boards(p["floater"]) == %{
               "task_boards" => [entry.("brewery", false), entry.("bar", false)]
             }

      assert boards(p["splitRole"]) == %{
               "task_boards" => [entry.("brewery", false), entry.("bar", true)]
             }

      assert boards(p["dualMgr"]) == %{
               "task_boards" => [entry.("bar", true), entry.("office", true)]
             }

      # Owners also get the All departments view, last (no color, no tools).
      all = %{"key" => "all", "name" => "All departments", "manage" => false}

      for owner <- ~w(owner owner2) do
        assert boards(p[owner]) == %{
                 "task_boards" => [
                   entry.("brewery", true),
                   entry.("bar", true),
                   entry.("office", true),
                   entry.("sales", true),
                   all
                 ]
               }
      end

      for who <- ~w(breweryMgr floater barMgr dualMgr noDept),
          do: refute(Enum.any?(boards(p[who])["task_boards"], &(&1["key"] == "all")), who)

      assert boards(p["noDept"]) == %{"task_boards" => []}

      refute Map.has_key?(
               call(p["owner"], :get, "/api/me") |> json_response(200),
               "brewery_tasks_manage"
             )
    end
  end
end
