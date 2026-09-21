defmodule RockcutApiWeb.NotificationControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  alias RockcutApi.Notifications

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  test "lists notifications, counts unread, and marks read", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    Notifications.notify(emp, :shift_published, %{title: "Hi", body: "b", data: %{}})

    body = conn |> bearer(emp) |> get(~p"/api/notifications") |> json_response(200)
    assert body["unread"] == 1
    assert [entry] = body["data"]

    conn |> bearer(emp) |> post(~p"/api/notifications/#{entry["id"]}/read") |> json_response(200)

    count =
      conn
      |> bearer(emp)
      |> get(~p"/api/notifications/unread_count")
      |> json_response(200)
      |> Map.fetch!("count")

    assert count == 0
  end

  test "mark all read", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    Notifications.notify(emp, :open_shift, %{title: "a", body: "b", data: %{}})
    Notifications.notify(emp, :open_shift, %{title: "c", body: "d", data: %{}})

    conn |> bearer(emp) |> post(~p"/api/notifications/read_all") |> json_response(200)

    assert conn
           |> bearer(emp)
           |> get(~p"/api/notifications/unread_count")
           |> json_response(200)
           |> Map.fetch!("count") == 0
  end

  test "notification preferences round-trip", %{conn: conn} do
    emp = user_with_role("employee", "bar")

    updated =
      conn
      |> bearer(emp)
      |> put(~p"/api/notification_preferences", %{prefs: %{"open_shift" => %{"email" => false}}})
      |> json_response(200)

    assert updated["data"]["open_shift"]["email"] == false

    got = conn |> bearer(emp) |> get(~p"/api/notification_preferences") |> json_response(200)
    assert got["data"]["open_shift"]["email"] == false
  end
end
