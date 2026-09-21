defmodule RockcutApiWeb.TimeOffControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  @start "2026-10-01T16:00:00Z"
  @finish "2026-10-03T00:00:00Z"

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  defp create_req(conn, user, attrs \\ %{}) do
    conn
    |> bearer(user)
    |> post(
      ~p"/api/time_off",
      Map.merge(%{type: "pto", all_day: true, starts_at: @start, ends_at: @finish}, attrs)
    )
    |> json_response(201)
  end

  test "a user submits a pending request for themselves", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    body = create_req(conn, emp)
    assert body["data"]["status"] == "pending"
    assert body["data"]["user_id"] == emp.id
    assert body["data"]["type"] == "pto"
  end

  test "an employee sees only their own requests", %{conn: conn} do
    emp1 = user_with_role("employee", "bar", %{email: "e1@rockcut.com"})
    emp2 = user_with_role("employee", "bar", %{email: "e2@rockcut.com"})
    create_req(conn, emp1)
    create_req(conn, emp2)

    ids =
      conn
      |> bearer(emp1)
      |> get(~p"/api/time_off")
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.map(& &1["user_id"])

    assert Enum.all?(ids, &(&1 == emp1.id))
  end

  test "a manager sees a report's request and approves it", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    emp = user_with_role("employee", "bar", %{email: "rep@rockcut.com"})
    req = create_req(conn, emp)["data"]

    seen =
      conn
      |> bearer(manager)
      |> get(~p"/api/time_off")
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.map(& &1["id"])

    assert req["id"] in seen

    approved =
      conn
      |> bearer(manager)
      |> post(~p"/api/time_off/#{req["id"]}/review", %{status: "approved"})
      |> json_response(200)

    assert approved["data"]["status"] == "approved"
    assert approved["data"]["reviewed_by"]["id"] == manager.id
  end

  test "a manager cannot approve their own request", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    req = create_req(conn, manager)["data"]

    assert conn
           |> bearer(manager)
           |> post(~p"/api/time_off/#{req["id"]}/review", %{status: "approved"})
           |> json_response(403)
  end

  test "an employee cannot review", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    other = user_with_role("employee", "bar", %{email: "o@rockcut.com"})
    req = create_req(conn, other)["data"]

    assert conn
           |> bearer(emp)
           |> post(~p"/api/time_off/#{req["id"]}/review", %{status: "approved"})
           |> json_response(403)
  end

  test "the requester cancels their pending request", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    req = create_req(conn, emp)["data"]

    body =
      conn |> bearer(emp) |> post(~p"/api/time_off/#{req["id"]}/cancel") |> json_response(200)

    assert body["data"]["status"] == "cancelled"
  end
end
