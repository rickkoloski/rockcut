defmodule RockcutApiWeb.TaskBoardDeviceTest do
  @moduledoc """
  D40 (D38 spec §3.4, D41 item 6, plan decisions 1–4): a department's shared
  tablet on its own task board. Reads need no code; every write needs a
  staff code of a member of the tablet's home department and is recorded as
  that person, with the tablet beside them (S9g, S42–S47, S68, API side).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{AccountsFixtures, Repo, StaffCodes, Tasks}
  alias RockcutApi.StaffCodes.RateLimiter
  alias RockcutApi.Tasks.Event

  setup do
    RateLimiter.reset()
    p = personas(~w(owner breweryMgr brewer1 brewer2 barMgr bartender1 floater))
    {:ok, _} = StaffCodes.set(p["brewer1"], "1111", p["breweryMgr"])
    {:ok, _} = StaffCodes.set(p["bartender1"], "2222", p["barMgr"])
    {:ok, _} = StaffCodes.set(p["floater"], "3333", p["owner"])

    brewery = RockcutApi.TaskFixtures.task_board("brewery")
    # The Brewery's four Daily items come with the D38 migration.
    temps = Enum.find(Tasks.list_items(brewery), &(&1.name == "Temps"))

    device = AccountsFixtures.device_fixture(%{home: "brewery", name: "Brewhouse tablet"})
    token = AccountsFixtures.device_token_fixture(device, "Brewhouse Tab")

    %{p: p, brewery: brewery, temps: temps, device: device, token: token}
  end

  defp today, do: Date.to_iso8601(Tasks.today())

  defp add(token, attrs \\ %{}, board \\ "brewery"),
    do:
      call_device(
        token,
        :post,
        "/api/boards/#{board}/tasks",
        Map.merge(%{title: "Keg Wash", due_on: today()}, attrs)
      )

  defp history(p, who \\ "breweryMgr", board \\ "brewery"),
    do: call(p[who], :get, "/api/boards/#{board}/tasks/history") |> json_response(200)

  describe "reads" do
    test "S42: /api/me lists only its home board, without manage or All departments", %{
      token: token
    } do
      body = call_device(token, :get, "/api/me") |> json_response(200)

      assert [%{"key" => "brewery", "manage" => false}] = body["task_boards"]
    end

    test "S42/S9g: the board and a task's series read without a code", %{token: token, p: p} do
      %{"data" => %{"id" => id}} =
        call(p["brewer1"], :post, "/api/boards/brewery/tasks", %{
          title: "Keg Wash",
          due_on: today(),
          repeat: "weekly",
          repeat_weekdays: [Date.day_of_week(Tasks.today())]
        })
        |> json_response(201)

      board =
        call_device(token, :get, "/api/boards/brewery/tasks", %{from: today(), to: today()})
        |> json_response(200)

      assert [%{"date" => _, "cards" => [%{"id" => ^id}]}] = board["data"]["days"]

      assert %{"data" => %{"id" => _}} =
               call_device(token, :get, "/api/boards/brewery/tasks/#{id}/series")
               |> json_response(200)

      %{"data" => items} =
        call_device(token, :get, "/api/boards/brewery/daily_items") |> json_response(200)

      assert "Temps" in Enum.map(items, & &1["name"])
    end
  end

  describe "writes need a staff code" do
    test "S47: POST a task with no staff_code → 422 staff_code_required", %{token: token} do
      assert %{"error" => "staff_code_required"} = add(token) |> json_response(422)
      assert Repo.all(RockcutApi.Tasks.Task) == []
    end

    test "S9g: Mark completed asks for a code; with one it's done as that person", %{
      token: token,
      p: p
    } do
      %{"data" => %{"id" => id}} =
        call(p["brewer2"], :post, "/api/boards/brewery/tasks", %{
          title: "Keg Wash",
          due_on: today()
        })
        |> json_response(201)

      path = "/api/boards/brewery/tasks/#{id}/complete"

      assert %{"error" => "staff_code_required"} =
               call_device(token, :post, path) |> json_response(422)

      body = call_device(token, :post, path, %{staff_code: "1111"}) |> json_response(200)
      assert body["recorded_as"] == p["brewer1"].name
      assert body["data"]["done"]
      assert body["data"]["completed_by_id"] == p["brewer1"].id
    end

    test "S43: a tick with brewer1's code; History reads brewer1 on the shared device", %{
      token: token,
      p: p,
      temps: temps,
      device: device
    } do
      path = "/api/boards/brewery/daily_checks/#{today()}/#{temps.id}"

      body = call_device(token, :put, path, %{staff_code: "1111"}) |> json_response(200)
      assert body["recorded_as"] == p["brewer1"].name
      assert body["data"]["completed_by_id"] == p["brewer1"].id

      assert [%{"actor_name" => name, "on_shared_device" => true, "title" => "Temps"} | _] =
               history(p)["data"]

      assert name == p["brewer1"].name
      assert Repo.one(from e in Event, order_by: [desc: e.id], limit: 1).device_id == device.id

      # The server keeps no "acting as" window: the tablet sends the code again.
      assert %{"error" => "staff_code_required"} =
               call_device(token, :delete, path) |> json_response(422)

      assert %{"recorded_as" => _} =
               call_device(token, :delete, path, %{staff_code: "1111"}) |> json_response(200)
    end

    test "S44 (API): every add needs the code, one after another", %{token: token} do
      assert add(token, %{staff_code: "1111"}).status == 201
      assert %{"error" => "staff_code_required"} = add(token) |> json_response(422)
      assert add(token, %{staff_code: "1111"}).status == 201
    end

    test "S45: a Taproom member's code is a wrong code here, and counts", %{token: token} do
      assert %{"error" => "staff_code_invalid"} =
               add(token, %{staff_code: "2222"}) |> json_response(422)

      for _ <- 1..3, do: add(token, %{staff_code: "0000"})
      # The 5th wrong code (bartender1's counted as the 1st) locks the tablet.
      assert %{"error" => "staff_code_locked"} =
               add(token, %{staff_code: "0000"}) |> json_response(429)
    end

    test "a member of two departments (floater) is accepted on either tablet", %{
      token: token,
      p: p
    } do
      assert %{"recorded_as" => name} = add(token, %{staff_code: "3333"}) |> json_response(201)
      assert name == p["floater"].name

      {_device, taproom} = taproom_device()
      assert add(taproom, %{staff_code: "3333"}, "bar").status == 201
    end

    test "S46: 5 wrong codes lock code entry for 10 minutes, as D37 S9", %{token: token} do
      for _ <- 1..4,
          do:
            assert(
              %{"error" => "staff_code_invalid"} =
                add(token, %{staff_code: "9999"}) |> json_response(422)
            )

      assert %{"error" => "staff_code_locked", "retry_after_minutes" => 10} =
               add(token, %{staff_code: "9999"}) |> json_response(429)

      # Even the right code waits out the lock.
      assert add(token, %{staff_code: "1111"}).status == 429
    end

    test "S68: a recurring task with a code; History: created, on the shared device", %{
      token: token,
      p: p
    } do
      body =
        add(token, %{
          staff_code: "1111",
          repeat: "weekly",
          repeat_weekdays: [Date.day_of_week(Tasks.today())]
        })
        |> json_response(201)

      assert body["recorded_as"] == p["brewer1"].name
      assert body["data"]["series_id"]
      assert body["data"]["created_by_id"] == p["brewer1"].id

      assert [%{"action" => "created", "on_shared_device" => true, "actor_id" => actor_id}] =
               history(p)["data"]

      assert actor_id == p["brewer1"].id
    end

    test "edit, move, uncomplete, stop repeating, delete and move-all with a code", %{
      token: token,
      p: p
    } do
      code = %{staff_code: "1111"}

      %{"data" => %{"id" => id}} =
        add(
          token,
          Map.merge(code, %{repeat: "weekly", repeat_weekdays: [Date.day_of_week(Tasks.today())]})
        )
        |> json_response(201)

      base = "/api/boards/brewery/tasks/#{id}"

      for {verb, path, params} <- [
            {:patch, base, %{title: "Keg Wash + sanitize", scope: "this"}},
            {:post, base <> "/move", %{due_on: today()}},
            {:post, base <> "/complete", %{}},
            {:post, base <> "/uncomplete", %{}},
            {:post, base <> "/stop_repeating", %{}},
            {:post, "/api/boards/brewery/tasks/move_overdue_to_today", %{}},
            {:delete, base, %{scope: "this"}}
          ] do
        body = call_device(token, verb, path, Map.merge(code, params)) |> json_response(200)
        assert body["recorded_as"] == p["brewer1"].name, "#{verb} #{path}"
      end

      events = Repo.all(from e in Event, where: e.task_id == ^id)
      assert events != []
      assert Enum.all?(events, &(&1.actor_id == p["brewer1"].id and not is_nil(&1.device_id)))
    end

    test "people's writes carry no recorded_as and no device", %{p: p} do
      body =
        call(p["brewer1"], :post, "/api/boards/brewery/tasks", %{
          title: "Keg Wash",
          due_on: today()
        })
        |> json_response(201)

      refute Map.has_key?(body, "recorded_as")
      assert [%Event{device_id: nil}] = Repo.all(Event)
    end
  end

  describe "what a tablet can't reach" do
    test "History and Daily items changes → 403", %{token: token, temps: temps} do
      for {verb, path} <- [
            {:get, "/api/boards/brewery/tasks/history"},
            {:post, "/api/boards/brewery/daily_items"},
            {:put, "/api/boards/brewery/daily_items/order"},
            {:patch, "/api/boards/brewery/daily_items/#{temps.id}"},
            {:post, "/api/boards/brewery/daily_items/#{temps.id}/restore"},
            {:delete, "/api/boards/brewery/daily_items/#{temps.id}"}
          ] do
        conn = call_device(token, verb, path, %{staff_code: "1111", name: "DO"})
        assert conn.status == 403, "#{verb} #{path}"
      end
    end

    test "the brewhouse tablet is refused on bar and all, even with a valid code", %{
      token: token
    } do
      assert call_device(token, :get, "/api/boards/bar/tasks", %{from: today(), to: today()}).status ==
               403

      assert %{"error" => "Forbidden"} =
               add(token, %{staff_code: "3333"}, "bar") |> json_response(403)

      assert call_device(token, :get, "/api/boards/all/tasks", %{from: today(), to: today()}).status ==
               403

      # No code was checked on the other board: nothing counted toward the lock.
      for _ <- 1..5, do: add(token, %{staff_code: "0000"}, "bar")
      assert add(token, %{staff_code: "1111"}).status == 201

      assert Repo.all(
               from t in RockcutApi.Tasks.Task,
                 where: t.department_id != ^RockcutApi.TaskFixtures.task_board("brewery").id
             ) == []
    end
  end

  describe "the Taproom tablet (D41 item 6)" do
    test "uses /api/boards/bar with a Taproom member's code; Brewery's code is wrong there", %{
      p: p
    } do
      {_device, token} = taproom_device()

      assert %{"recorded_as" => name} =
               add(token, %{staff_code: "2222"}, "bar") |> json_response(201)

      assert name == p["bartender1"].name

      assert %{"error" => "staff_code_invalid"} =
               add(token, %{staff_code: "1111"}, "bar") |> json_response(422)

      assert call_device(token, :get, "/api/boards/brewery/tasks", %{from: today(), to: today()}).status ==
               403

      assert [%{"on_shared_device" => true}] = history(p, "barMgr", "bar")["data"]
    end
  end
end
