defmodule RockcutApiWeb.PositionControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  test "any authenticated user can list positions", %{conn: conn} do
    employee = user_with_role("employee", "bar")
    position_fixture(%{name: "Barback", group: "Bar"})

    names =
      conn
      |> bearer(employee)
      |> get(~p"/api/positions")
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.map(& &1["name"])

    assert "Barback" in names
  end

  test "a manager can create a position", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    bar = department_fixture("bar")

    body =
      conn
      |> bearer(manager)
      |> post(~p"/api/positions", %{name: "Sommelier", group: "Bar", department_id: bar.id})
      |> json_response(201)

    assert body["data"]["name"] == "Sommelier"
    assert body["data"]["department_id"] == bar.id
  end

  test "an employee cannot create a position", %{conn: conn} do
    employee = user_with_role("employee", "bar")

    assert conn
           |> bearer(employee)
           |> post(~p"/api/positions", %{name: "Nope"})
           |> json_response(403)
  end

  test "a manager sets a position's color shade", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    pos = position_fixture(%{name: "Barback", group: "Bar"})

    body =
      conn
      |> bearer(manager)
      |> patch(~p"/api/positions/#{pos.id}", %{color_shade: 0.45})
      |> json_response(200)

    assert body["data"]["color_shade"] == 0.45
  end

  test "a color shade outside 0..1 is rejected", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    pos = position_fixture(%{name: "Barback2", group: "Bar"})

    assert conn
           |> bearer(manager)
           |> patch(~p"/api/positions/#{pos.id}", %{color_shade: 1.5})
           |> json_response(422)
  end

  test "deleting a position used by a schedule template deactivates it", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    pos = position_fixture()

    conn
    |> bearer(manager)
    |> post(~p"/api/schedule_templates", %{
      name: "Week",
      kind: "week",
      items: [%{position_id: pos.id, day_index: 0, start_time: "09:00:00", end_time: "17:00:00"}]
    })
    |> json_response(201)

    conn |> bearer(manager) |> delete(~p"/api/positions/#{pos.id}") |> json_response(200)

    refute RockcutApi.Repo.get!(RockcutApi.Scheduling.Position, pos.id).active
  end

  test "deleting an unused position removes it", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    pos = position_fixture()

    conn |> bearer(manager) |> delete(~p"/api/positions/#{pos.id}") |> json_response(200)

    assert is_nil(RockcutApi.Repo.get(RockcutApi.Scheduling.Position, pos.id))
  end
end
