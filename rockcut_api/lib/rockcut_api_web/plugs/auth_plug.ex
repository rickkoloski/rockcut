defmodule RockcutApiWeb.AuthPlug do
  @moduledoc """
  Verifies the Bearer token, loads the full user (memberships preloaded), and
  assigns `:current_user`. Rejects missing, invalid, or deactivated users with
  401. Checking `active` on every request gives immediate soft revocation when a
  user is deactivated.
  """
  import Plug.Conn
  alias RockcutApi.Accounts

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, user_id} <- RockcutApiWeb.SessionController.verify_token(token),
         %{active: true} = user <- Accounts.get_user(user_id) do
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
