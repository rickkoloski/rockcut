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
end
