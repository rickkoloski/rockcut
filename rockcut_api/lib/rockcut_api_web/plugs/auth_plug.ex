defmodule RockcutApiWeb.AuthPlug do
  @moduledoc """
  Verifies the Bearer token, loads the full user (memberships preloaded), and
  assigns `:current_user`. Rejects missing, invalid, or deactivated users with
  401. Checking `active` on every request gives immediate soft revocation when a
  user is deactivated.

  D33: a `dev_` token is a paired tablet's token, looked up (and checked for
  revocation) on every request; it also assigns `:device_token`. A device
  account can only authenticate that way: a signed session token for a device
  user is refused.

  D34: a `ses_` token is a person's revocable session, looked up on every
  request; it also assigns `:current_session`. Any other token is a pre-D34
  `Phoenix.Token`, accepted until it expires unless the user's legacy tokens
  were cut off (password change or reset, "Sign out of all other devices").
  """
  import Plug.Conn
  alias RockcutApi.{Accounts, Authz, Devices, Sessions}

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> "dev_" <> _rest = "Bearer " <> token] -> device_auth(conn, token)
      ["Bearer " <> "ses_" <> _rest = "Bearer " <> token] -> session_auth(conn, token)
      ["Bearer " <> token] -> legacy_auth(conn, token)
      _ -> unauthorized(conn)
    end
  end

  defp device_auth(conn, token) do
    case Devices.authenticate_token(token) do
      {:ok, device, row} ->
        conn |> assign(:current_user, device) |> assign(:device_token, row)

      :error ->
        unauthorized(conn)
    end
  end

  defp session_auth(conn, token) do
    case Sessions.authenticate(token) do
      {:ok, user, row} ->
        conn |> assign(:current_user, user) |> assign(:current_session, row)

      :error ->
        unauthorized(conn)
    end
  end

  defp legacy_auth(conn, token) do
    with {:ok, user_id} <- RockcutApiWeb.SessionController.verify_token(token),
         %{active: true} = user <- Accounts.get_user(user_id),
         false <- Authz.device?(user),
         false <- Sessions.legacy_tokens_revoked?(user) do
      assign(conn, :current_user, user)
    else
      _ -> unauthorized(conn)
    end
  end

  defp unauthorized(conn) do
    conn
    |> put_status(:unauthorized)
    |> Phoenix.Controller.json(%{error: "Unauthorized"})
    |> halt()
  end
end
