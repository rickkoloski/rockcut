defmodule RockcutApiWeb.PushController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Notifications.WebPush

  @doc "The VAPID public key the browser needs to create a push subscription."
  def public_key(conn, _params) do
    json(conn, %{public_key: WebPush.vapid_public_key()})
  end

  @doc "Register (upsert) the current device's push subscription."
  def subscribe(conn, %{"endpoint" => endpoint, "keys" => %{"p256dh" => p256dh, "auth" => auth}}) do
    attrs = %{
      endpoint: endpoint,
      p256dh: p256dh,
      auth: auth,
      user_agent: conn |> get_req_header("user-agent") |> List.first()
    }

    case WebPush.subscribe(conn.assigns.current_user, attrs) do
      {:ok, _sub} ->
        send_resp(conn, :created, "")

      {:error, _changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: %{push: ["invalid subscription"]}})
    end
  end

  def subscribe(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "endpoint and keys are required"})
  end

  @doc "Remove a device's push subscription."
  def unsubscribe(conn, %{"endpoint" => endpoint}) do
    WebPush.unsubscribe(conn.assigns.current_user, endpoint)
    send_resp(conn, :no_content, "")
  end

  def unsubscribe(conn, _params), do: send_resp(conn, :no_content, "")
end
