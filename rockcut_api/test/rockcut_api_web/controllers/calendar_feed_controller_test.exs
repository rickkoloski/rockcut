defmodule RockcutApiWeb.CalendarFeedControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.SchedulingFixtures

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  defp feeds(conn, user) do
    conn
    |> bearer(user)
    |> get(~p"/api/calendar_feeds")
    |> json_response(200)
    |> Map.fetch!("data")
  end

  test "an employee gets a personal feed but not a whole-schedule feed", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    types = feeds(conn, emp) |> Enum.map(& &1["subject_type"])
    assert "user" in types
    refute "all" in types
    refute "department" in types
  end

  test "owner gets department + whole-schedule feeds", %{conn: conn} do
    owner = owner_fixture()
    for k <- ~w(brewery bar), do: department_fixture(k)
    types = feeds(conn, owner) |> Enum.map(& &1["subject_type"])
    assert "all" in types
    assert "department" in types
  end

  test "the public ICS feed renders published shifts with no auth", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    bar = department_fixture("bar")
    shift_fixture(%{department: bar, status: "published", assignee_id: emp.id})

    user_feed = feeds(conn, emp) |> Enum.find(&(&1["subject_type"] == "user"))
    resp = build_conn() |> get("/api/calendar/#{user_feed["token"]}.ics")

    assert resp.status == 200
    assert get_resp_header(resp, "content-type") |> hd() =~ "text/calendar"
    assert resp.resp_body =~ "BEGIN:VCALENDAR"
    assert resp.resp_body =~ "shift-"
  end

  test "a manager rotates a department feed and the old token 404s", %{conn: conn} do
    manager = user_with_role("manager", "bar")
    bar = department_fixture("bar")

    old =
      feeds(conn, manager)
      |> Enum.find(&(&1["subject_type"] == "department"))
      |> Map.fetch!("token")

    rotated =
      conn
      |> bearer(manager)
      |> post(~p"/api/calendar_feeds/rotate", %{subject_type: "department", subject_id: bar.id})
      |> json_response(200)

    refute rotated["data"]["token"] == old
    assert build_conn() |> get("/api/calendar/#{old}.ics") |> Map.get(:status) == 404
  end

  test "an employee cannot rotate a department feed", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    bar = department_fixture("bar")

    assert conn
           |> bearer(emp)
           |> post(~p"/api/calendar_feeds/rotate", %{
             subject_type: "department",
             subject_id: bar.id
           })
           |> json_response(403)
  end
end
