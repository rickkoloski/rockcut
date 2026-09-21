defmodule RockcutApiWeb.ShiftTemplateControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  test "any authenticated user can list a position's standard hours", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    employee = user_with_role("employee", "bar")
    pos = position_fixture()

    conn
    |> bearer(manager)
    |> post(~p"/api/shift_templates", %{
      position_id: pos.id,
      name: "Open",
      start_time: "08:00:00",
      end_time: "16:00:00"
    })
    |> json_response(201)

    names =
      conn
      |> bearer(employee)
      |> get(~p"/api/shift_templates", %{position_id: pos.id})
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.map(& &1["name"])

    assert "Open" in names
  end

  test "a manager can create a preset; an employee cannot", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    employee = user_with_role("employee", "bar")
    pos = position_fixture()

    assert conn
           |> bearer(manager)
           |> post(~p"/api/shift_templates", %{
             position_id: pos.id,
             name: "Mid",
             start_time: "12:00:00",
             end_time: "20:00:00"
           })
           |> json_response(201)

    assert conn
           |> bearer(employee)
           |> post(~p"/api/shift_templates", %{
             position_id: pos.id,
             name: "Nope",
             start_time: "12:00:00",
             end_time: "20:00:00"
           })
           |> json_response(403)
  end
end
