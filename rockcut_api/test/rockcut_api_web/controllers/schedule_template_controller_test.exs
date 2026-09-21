defmodule RockcutApiWeb.ScheduleTemplateControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  test "a manager saves a named week template with items", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    pos = position_fixture()

    body =
      conn
      |> bearer(manager)
      |> post(~p"/api/schedule_templates", %{
        name: "Typical week",
        kind: "week",
        items: [
          %{position_id: pos.id, day_index: 0, start_time: "09:00:00", end_time: "17:00:00"}
        ]
      })
      |> json_response(201)

    assert body["data"]["name"] == "Typical week"
    assert [%{"position_id" => pid, "day_index" => 0}] = body["data"]["items"]
    assert pid == pos.id
  end

  test "an employee cannot create a template", %{conn: conn} do
    employee = user_with_role("employee", "bar")

    assert conn
           |> bearer(employee)
           |> post(~p"/api/schedule_templates", %{name: "x", kind: "week", items: []})
           |> json_response(403)
  end

  test "lists and deletes templates", %{conn: conn} do
    owner = owner_fixture()
    pos = position_fixture()

    created =
      conn
      |> bearer(owner)
      |> post(~p"/api/schedule_templates", %{
        name: "Del me",
        kind: "day",
        items: [
          %{position_id: pos.id, day_index: 0, start_time: "09:00:00", end_time: "17:00:00"}
        ]
      })
      |> json_response(201)

    id = created["data"]["id"]

    names =
      conn
      |> bearer(owner)
      |> get(~p"/api/schedule_templates")
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.map(& &1["name"])

    assert "Del me" in names

    assert conn
           |> bearer(owner)
           |> delete(~p"/api/schedule_templates/#{id}")
           |> json_response(200)
  end
end
