defmodule RockcutApiWeb.PushControllerTest do
  use RockcutApiWeb.ConnCase

  import RockcutApi.AccountsFixtures
  alias RockcutApi.Notifications.WebPush

  defp bearer(conn, user) do
    token = Phoenix.Token.sign(@endpoint, "user auth", user.id)
    put_req_header(conn, "authorization", "Bearer #{token}")
  end

  defp keys do
    {pub, _priv} = :crypto.generate_key(:ecdh, :prime256v1)

    %{
      "p256dh" => Base.url_encode64(pub, padding: false),
      "auth" => Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
    }
  end

  test "GET /api/push/public_key returns the VAPID public key", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    body = conn |> bearer(emp) |> get(~p"/api/push/public_key") |> json_response(200)
    assert is_binary(body["public_key"]) and body["public_key"] != ""
  end

  test "subscribe then unsubscribe round-trips", %{conn: conn} do
    emp = user_with_role("employee", "bar")
    endpoint = "https://push.example.com/xyz"

    conn
    |> bearer(emp)
    |> post(~p"/api/push/subscriptions", %{endpoint: endpoint, keys: keys()})
    |> response(201)

    assert WebPush.list(emp) |> Enum.map(& &1.endpoint) == [endpoint]

    conn
    |> bearer(emp)
    |> delete(~p"/api/push/subscriptions", %{endpoint: endpoint})
    |> response(204)

    assert WebPush.list(emp) == []
  end

  test "subscribe without keys is a 400", %{conn: conn} do
    emp = user_with_role("employee", "bar")

    conn
    |> bearer(emp)
    |> post(~p"/api/push/subscriptions", %{endpoint: "https://push.example.com/x"})
    |> json_response(400)
  end

  test "push endpoints require authentication", %{conn: conn} do
    conn |> get(~p"/api/push/public_key") |> response(401)
  end
end
