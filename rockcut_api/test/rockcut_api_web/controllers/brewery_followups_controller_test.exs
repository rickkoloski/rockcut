defmodule RockcutApiWeb.BreweryFollowupsControllerTest do
  @moduledoc """
  D39 follow-ups from the D38 DEV QA (spec §5): writes on a retired Daily
  item (GAP-1/GAP-2, O-3), restoring one (S75), and a task someone deleted
  (O-1, S77).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.BreweryTasks

  setup do
    p = personas(~w(owner breweryMgr brewer1 bartender1))
    %{p: p, today: BreweryTasks.today()}
  end

  defp item_id(name), do: Enum.find(BreweryTasks.list_items(), &(&1.name == name)).id

  defp retire!(mgr, name) do
    id = item_id(name)
    call(mgr, :patch, "/api/brewery/daily_items/#{id}", %{active: false}) |> json_response(200)
    id
  end

  describe "a PATCH on a retired item is 422 retired, with no change (GAP-1, GAP-2)" do
    for {label, params} <- [
          {"a rename", %{name: "Temperature"}},
          {"active: false", %{active: false}},
          {"a position", %{position: 1}},
          {"active: true (G3)", %{active: true}}
        ] do
      test label, %{p: p} do
        mgr = p["breweryMgr"]
        temps = retire!(mgr, "Temps")
        before = BreweryTasks.get_item(temps)

        assert %{"error" => "retired", "message" => "That Daily item was retired"} =
                 call(
                   mgr,
                   :patch,
                   "/api/brewery/daily_items/#{temps}",
                   unquote(Macro.escape(params))
                 )
                 |> json_response(422)

        assert BreweryTasks.get_item(temps) == before
      end
    end

    test "an item that never existed stays 404", %{p: p} do
      assert call(p["breweryMgr"], :patch, "/api/brewery/daily_items/999999", %{name: "X"}).status ==
               404
    end
  end

  test "unticking a retired item is 422 retired and the tick stays (Decision 1, O-3)", %{
    p: p,
    today: today
  } do
    path = "/api/brewery/daily_checks/#{Date.to_iso8601(today)}/#{item_id("Temps")}"
    assert call(p["brewer1"], :put, path).status == 200
    retire!(p["breweryMgr"], "Temps")

    assert %{"error" => "retired"} = call(p["brewer1"], :delete, path) |> json_response(422)

    assert %{"items" => items} =
             call(p["brewer1"], :get, "/api/brewery/tasks", %{
               from: Date.to_iso8601(today),
               to: Date.to_iso8601(today)
             })
             |> json_response(200)
             |> get_in(["data", "days", Access.at(0), "daily"])

    assert %{"checked" => true, "active" => false} = Enum.find(items, &(&1["name"] == "Temps"))
  end

  describe "a task someone deleted (O-1, S77)" do
    test "edit, delete, move, complete and uncomplete answer 410 deleted", %{p: p, today: today} do
      brewer = p["brewer1"]
      iso = Date.to_iso8601(today)

      task =
        call(brewer, :post, "/api/brewery/tasks", %{title: "Package FV6", due_on: iso})
        |> json_response(201)
        |> Map.get("data")

      path = "/api/brewery/tasks/#{task["id"]}"
      assert call(p["breweryMgr"], :delete, path).status == 204

      for {verb, route, params} <- [
            {:patch, path, %{title: "Package FV7"}},
            {:delete, path, %{}},
            {:post, path <> "/move", %{due_on: iso}},
            {:post, path <> "/complete", %{}},
            {:post, path <> "/uncomplete", %{}}
          ] do
        assert %{"error" => "deleted", "message" => "This task was deleted"} =
                 call(brewer, verb, route, params) |> json_response(410),
               "#{verb} #{route}"
      end

      # Nothing is recreated.
      refute BreweryTasks.get_task(task["id"])
    end

    test "an id that never existed stays 404", %{p: p, today: today} do
      for {verb, route, params} <- [
            {:patch, "/api/brewery/tasks/999999", %{title: "X"}},
            {:delete, "/api/brewery/tasks/999999", %{}},
            {:post, "/api/brewery/tasks/999999/move", %{due_on: Date.to_iso8601(today)}},
            {:post, "/api/brewery/tasks/999999/complete", %{}},
            {:post, "/api/brewery/tasks/999999/uncomplete", %{}}
          ] do
        assert call(p["brewer1"], verb, route, params).status == 404, "#{verb} #{route}"
      end
    end
  end
end
