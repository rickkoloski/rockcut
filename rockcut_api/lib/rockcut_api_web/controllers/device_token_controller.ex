defmodule RockcutApiWeb.DeviceTokenController do
  @moduledoc """
  Tablet tokens (D33). `create` is public: a tablet exchanges a pairing code
  for its token (rate-limited per IP). `delete` revokes one tablet (owners and
  managers of the device's home department).
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [user: 1, for_viewer: 2]
  alias RockcutApi.{Authz, Devices}

  action_fallback RockcutApiWeb.FallbackController

  def create(conn, params) do
    case Devices.exchange_code(params["code"], params["name"] || "", client_ip(conn)) do
      {:ok, token, row} ->
        device = RockcutApi.Accounts.get_user!(row.user_id)

        conn
        |> put_status(:created)
        |> json(%{token: token, user: user(device) |> for_viewer(device)})

      {:error, :rate_limited} ->
        conn
        |> put_status(:too_many_requests)
        |> json(%{error: "Too many attempts. Try again in a few minutes."})

      {:error, :invalid_name} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Give this tablet a name (up to 60 characters)."})

      {:error, :invalid_code} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "That code is invalid or has expired. Ask a manager for a new one."})
    end
  end

  def delete(conn, %{"id" => id}) do
    actor = conn.assigns.current_user

    with %{} = row <- Devices.get_token(id),
         %{} = device <- Devices.get_device(row.user_id) do
      # A tablet the actor may not revoke → 403 (spec S3).
      if Authz.can?(actor, :revoke_token, device) do
        {:ok, _} = Devices.revoke_token(row, actor)
        send_resp(conn, :no_content, "")
      else
        conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
      end
    else
      _ -> {:error, :not_found}
    end
  end

  # The client address for the wrong-code limiter. `fly-client-ip` is set by
  # Fly's edge proxy, so it's trusted only when running on Fly
  # (`:trust_fly_client_ip`, from FLY_APP_NAME in runtime.exs). Anywhere else —
  # locally, in tests — a client could send any value, so `remote_ip` is used
  # and the header is ignored (review item 5).
  defp client_ip(conn) do
    with true <- Application.get_env(:rockcut_api, :trust_fly_client_ip, false),
         [ip | _] when ip != "" <- get_req_header(conn, "fly-client-ip") do
      ip
    else
      _ -> conn.remote_ip
    end
  end
end
