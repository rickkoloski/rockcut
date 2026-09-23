defmodule RockcutApiWeb.AvailabilityControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  defp create_slot(conn, user, attrs \\ %{}) do
    conn
    |> bearer(user)
    |> post(
      ~p"/api/availability",
      Map.merge(%{weekday: 1, kind: "unavailable", all_day: true}, attrs)
    )
  end

  test "a user creates an all-day unavailable slot for themselves", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    body = create_slot(conn, emp) |> json_response(201)
    assert body["data"]["user_id"] == emp.id
    assert body["data"]["weekday"] == 1
    assert body["data"]["kind"] == "unavailable"
    assert body["data"]["all_day"] == true
    assert body["data"]["start_time"] == nil
  end

  test "a timed slot keeps its window", %{conn: conn} do
    emp = user_with_role("employee", "bar")

    body =
      create_slot(conn, emp, %{
        all_day: false,
        start_time: "09:00:00",
        end_time: "13:00:00",
        kind: "preferred"
      })
      |> json_response(201)

    assert body["data"]["all_day"] == false
    assert body["data"]["start_time"] == "09:00:00"
    assert body["data"]["end_time"] == "13:00:00"
    assert body["data"]["kind"] == "preferred"
  end

  test "an employee including their own user_id still creates for themselves", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    body = create_slot(conn, emp, %{user_id: emp.id}) |> json_response(201)
    assert body["data"]["user_id"] == emp.id
  end

  test "a non-manager cannot set another user's availability", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    other = user_with_role("employee", "bar", %{email: "other@rockcut.com"})
    assert create_slot(conn, emp, %{user_id: other.id}) |> json_response(403)
  end

  test "a timed slot needs both times and end after start", %{conn: conn} do
    emp = user_with_role("employee", "bar")

    assert create_slot(conn, emp, %{all_day: false}) |> json_response(422)

    assert create_slot(conn, emp, %{all_day: false, start_time: "17:00:00", end_time: "09:00:00"})
           |> json_response(422)
  end

  test "weekday must be 0..6", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    assert create_slot(conn, emp, %{weekday: 7}) |> json_response(422)
  end

  test "an employee lists only their own slots", %{conn: conn} do
    emp1 = user_with_role("employee", "bar", %{email: "e1@rockcut.com"})
    emp2 = user_with_role("employee", "bar", %{email: "e2@rockcut.com"})
    create_slot(conn, emp1)
    create_slot(conn, emp2, %{weekday: 3})

    ids =
      conn
      |> bearer(emp1)
      |> get(~p"/api/availability")
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.map(& &1["user_id"])
      |> Enum.uniq()

    assert ids == [emp1.id]
  end

  test "an owner sees everyone's slots", %{conn: conn} do
    owner = owner_fixture()
    emp = user_with_role("employee", "bar")
    create_slot(conn, emp)

    data =
      conn
      |> bearer(owner)
      |> get(~p"/api/availability")
      |> json_response(200)
      |> Map.fetch!("data")

    assert Enum.any?(data, &(&1["user_id"] == emp.id))
  end

  test "a user deletes their own slot but not another's", %{conn: conn} do
    emp1 = user_with_role("employee", "bar", %{email: "d1@rockcut.com"})
    emp2 = user_with_role("employee", "bar", %{email: "d2@rockcut.com"})
    id1 = create_slot(conn, emp1) |> json_response(201) |> get_in(["data", "id"])

    # emp2 cannot delete emp1's slot
    assert conn |> bearer(emp2) |> delete(~p"/api/availability/#{id1}") |> response(403)
    # emp1 can
    assert conn |> bearer(emp1) |> delete(~p"/api/availability/#{id1}") |> response(204)
  end

  test "a manager sets availability for a report", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    emp = user_with_role("employee", "bar", %{email: "report@rockcut.com"})
    body = create_slot(conn, manager, %{user_id: emp.id, weekday: 2}) |> json_response(201)
    assert body["data"]["user_id"] == emp.id
    assert body["data"]["weekday"] == 2
  end

  test "an owner sets availability for anyone", %{conn: conn} do
    owner = owner_fixture()
    emp = user_with_role("employee", "office")
    body = create_slot(conn, owner, %{user_id: emp.id}) |> json_response(201)
    assert body["data"]["user_id"] == emp.id
  end

  test "a manager cannot set availability for someone they don't manage", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    outsider = user_with_role("employee", "office", %{email: "outsider@rockcut.com"})
    assert create_slot(conn, manager, %{user_id: outsider.id}) |> json_response(403)
  end

  test "a manager deletes a report's slot", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    emp = user_with_role("employee", "bar", %{email: "rep2@rockcut.com"})
    id = create_slot(conn, emp) |> json_response(201) |> get_in(["data", "id"])
    assert conn |> bearer(manager) |> delete(~p"/api/availability/#{id}") |> response(204)
  end
end
