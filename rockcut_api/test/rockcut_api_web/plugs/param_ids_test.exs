defmodule RockcutApiWeb.ParamIdsTest do
  @moduledoc """
  D55 §2.11 item 2: an out-of-range id in the body or the query is 422 on that
  key (it was a 500 from the database driver), and nothing is saved. Junk
  (`"abc"`) keeps the route's own answer; `before_id` keeps D38's rule.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures

  alias RockcutApi.Repo

  @huge 99_999_999_999_999_999_999
  @huge_s "99999999999999999999"

  setup do
    p = personas(~w(owner barMgr))
    %{owner: p["owner"], mgr: p["barMgr"]}
  end

  defp req(user, verb, path, body \\ nil) do
    conn =
      as(user)
      |> put_req_header("content-type", "application/json")
      |> dispatch(@endpoint, verb, path, if(body, do: Jason.encode!(body), else: nil))

    {conn.status, if(conn.resp_body in ["", nil], do: nil, else: Jason.decode!(conn.resp_body))}
  end

  @window "from=2026-11-01&to=2026-11-07"

  test "body ids past the range: 422 on that key, nothing saved", %{owner: owner} do
    counts = fn ->
      for s <- [
            RockcutApi.Scheduling.Shift,
            RockcutApi.TimeOff.Request,
            RockcutApi.Scheduling.ScheduleEvent,
            RockcutApi.Brewing.Recipe,
            RockcutApi.Brewing.Batch,
            RockcutApi.Accounts.User
          ],
          do: Repo.aggregate(s, :count)
    end

    before = counts.()

    for {verb, path, body, key} <- [
          {:post, "/api/shifts",
           %{
             position_id: @huge,
             starts_at: "2026-11-10T15:00:00Z",
             ends_at: "2026-11-10T20:00:00Z"
           }, "position_id"},
          {:post, "/api/shifts",
           %{
             position_id: @huge_s,
             starts_at: "2026-11-10T15:00:00Z",
             ends_at: "2026-11-10T20:00:00Z"
           }, "position_id"},
          {:post, "/api/time_off",
           %{user_id: @huge, kind: "pto", starts_on: "2026-11-10", ends_on: "2026-11-10"},
           "user_id"},
          {:post, "/api/schedule_events",
           %{department_id: @huge, title: "x", starts_at: "2026-11-10T15:00:00Z"},
           "department_id"},
          {:post, "/api/devices", %{name: "x", home_department_id: @huge}, "home_department_id"},
          {:post, "/api/recipes", %{brand_id: @huge, batch_size: 15}, "brand_id"},
          {:post, "/api/production/batches", %{template_id: @huge}, "template_id"},
          {:post, "/api/production/cips", %{tank_id: @huge, on: "2026-11-10"}, "tank_id"},
          {:post, "/api/production/steps/move", %{ids: [1, @huge], days: 1}, "ids"},
          {:post, "/api/users",
           %{email: "n@rockcut-test.com", memberships: [%{department_id: @huge}]},
           "department_id"}
        ] do
      assert {422, %{"errors" => %{^key => ["is out of range"]}}} = req(owner, verb, path, body),
             "#{verb} #{path} #{key}"
    end

    assert counts.() == before
  end

  test "query ids past the range: 422 on that key", %{owner: owner} do
    for {path, key} <- [
          {"/api/shifts?department_id=#{@huge_s}&#{@window}", "department_id"},
          {"/api/recipe_ingredients?recipe_id=#{@huge_s}", "recipe_id"},
          {"/api/time_off?user_id=#{@huge_s}", "user_id"}
        ] do
      assert {422, %{"errors" => %{^key => ["is out of range"]}}} = req(owner, :get, path), path
    end
  end

  test "junk and in-range ids aren't the plug's: the route answers as before", %{owner: owner} do
    for body <- [%{brand_id: "abc"}, %{brand_id: "12abc"}] do
      {status, resp} = req(owner, :post, "/api/recipes", Map.put(body, :batch_size, 15))
      assert status == 422, inspect(body)
      refute resp["errors"]["brand_id"] == ["is out of range"]
    end
  end

  test "before_id past the range keeps D38's rule: the task goes last", %{mgr: mgr} do
    {201, %{"data" => task}} =
      req(mgr, :post, "/api/boards/bar/tasks", %{title: "x", due_on: "2026-11-10"})

    assert {200, _} =
             req(mgr, :post, "/api/boards/bar/tasks/#{task["id"]}/move", %{
               due_on: "2026-11-11",
               before_id: @huge
             })

    assert Repo.get!(RockcutApi.Tasks.Task, task["id"]).due_on == ~D[2026-11-11]
  end
end
