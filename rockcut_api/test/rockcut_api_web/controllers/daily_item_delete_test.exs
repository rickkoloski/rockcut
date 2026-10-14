defmodule RockcutApiWeb.DailyItemDeleteTest do
  @moduledoc "D42 §2.4: deleting a retired Daily item that was never ticked (S126–S128)."
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.TaskFixtures
  import RockcutApi.PersonaFixtures
  import Phoenix.ConnTest

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Tasks.DailyItem

  setup do
    p = personas(~w(owner barMgr breweryMgr brewer1 splitRole))
    task_board("bar")
    %{p: p, today: Date.to_iso8601(Tasks.today())}
  end

  defp item_id(dept, name),
    do: Repo.get_by!(DailyItem, department_id: task_board(dept).id, name: name).id

  defp retire!(mgr, dept, id) do
    call(mgr, :patch, "/api/boards/#{dept}/daily_items/#{id}", %{active: false})
    |> json_response(200)
  end

  defp retired(user, dept) do
    call(user, :get, "/api/boards/#{dept}/daily_items", %{include_retired: "true"})
    |> json_response(200)
    |> Map.get("data")
    |> Enum.reject(& &1["active"])
  end

  defp daily_total(user, dept, day) do
    call(user, :get, "/api/boards/#{dept}/tasks", %{from: day, to: day})
    |> json_response(200)
    |> get_in(["data", "days", Access.at(0), "daily", "total"])
  end

  defp history(user, dept) do
    call(user, :get, "/api/boards/#{dept}/tasks/history") |> json_response(200) |> Map.get("data")
  end

  test "S126 barMgr deletes a never-ticked retired item", %{p: p, today: today} do
    mgr = p["barMgr"]

    %{"id" => id} =
      call(mgr, :post, "/api/boards/bar/daily_items", %{name: "[TEST-TEMP] Typo"})
      |> json_response(201)
      |> Map.get("data")

    retire!(mgr, "bar", id)
    total = daily_total(mgr, "bar", today)
    assert is_integer(total)

    assert [%{"id" => ^id, "deletable" => true}] = retired(mgr, "bar")
    assert call(mgr, :delete, "/api/boards/bar/daily_items/#{id}").status == 204

    assert retired(mgr, "bar") == []
    refute Repo.get(DailyItem, id)
    assert daily_total(mgr, "bar", today) == total

    actions =
      history(mgr, "bar")
      |> Enum.filter(&(&1["title"] == "[TEST-TEMP] Typo"))
      |> Enum.map(& &1["action"])
      |> Enum.sort()

    # The retire row stays: History is never rewritten.
    assert actions == ~w(item_added item_deleted item_retired)
  end

  test "S127 an item ticked once has no Delete: 422 has_ticks", %{p: p, today: today} do
    mgr = p["breweryMgr"]
    temps = item_id("brewery", "Temps")

    call(p["brewer1"], :put, "/api/boards/brewery/daily_checks/#{today}/#{temps}")
    |> json_response(200)

    retire!(mgr, "brewery", temps)

    assert [%{"id" => ^temps, "deletable" => false}] = retired(mgr, "brewery")

    assert %{"error" => "has_ticks"} =
             call(mgr, :delete, "/api/boards/brewery/daily_items/#{temps}") |> json_response(422)

    assert Repo.get(DailyItem, temps)
  end

  test "S128 an active item is 422 not_retired; another board's managers and members 403", %{
    p: p
  } do
    temps = item_id("brewery", "Temps")

    assert %{"error" => "not_retired"} =
             call(p["breweryMgr"], :delete, "/api/boards/brewery/daily_items/#{temps}")
             |> json_response(422)

    %{"id" => taproom} =
      call(p["barMgr"], :post, "/api/boards/bar/daily_items", %{name: "[TEST-TEMP] Lines"})
      |> json_response(201)
      |> Map.get("data")

    retire!(p["barMgr"], "bar", taproom)

    assert call(p["breweryMgr"], :delete, "/api/boards/bar/daily_items/#{taproom}").status == 403
    assert call(p["brewer1"], :delete, "/api/boards/brewery/daily_items/#{temps}").status == 403

    assert Repo.get(DailyItem, taproom)
  end

  test "another board's id is 404; an owner may delete", %{p: p} do
    temps = item_id("brewery", "Temps")
    retire!(p["breweryMgr"], "brewery", temps)

    # splitRole manages the Taproom; the owner may use both boards.
    for who <- ~w(splitRole owner),
        do: assert(call(p[who], :delete, "/api/boards/bar/daily_items/#{temps}").status == 404)

    assert call(p["owner"], :delete, "/api/boards/brewery/daily_items/999999").status == 404
    assert call(p["owner"], :delete, "/api/boards/brewery/daily_items/#{temps}").status == 204
    refute Repo.get(DailyItem, temps)
  end

  test "the active list has no deletable field", %{p: p} do
    for item <-
          call(p["brewer1"], :get, "/api/boards/brewery/daily_items")
          |> json_response(200)
          |> Map.get("data"),
        do: refute(Map.has_key?(item, "deletable"))
  end
end
