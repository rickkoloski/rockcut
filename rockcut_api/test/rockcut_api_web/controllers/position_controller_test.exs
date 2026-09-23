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
end
