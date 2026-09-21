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

  test "a manager can create a company-wide position", %{conn: conn} do
    manager = user_with_role("manager", "bar")

    body =
      conn
      |> bearer(manager)
      |> post(~p"/api/positions", %{name: "Sommelier", group: "Bar"})
      |> json_response(201)

    assert body["data"]["name"] == "Sommelier"
  end

  test "an employee cannot create a position", %{conn: conn} do
    employee = user_with_role("employee", "bar")

    assert conn
           |> bearer(employee)
           |> post(~p"/api/positions", %{name: "Nope"})
           |> json_response(403)
  end
end
