defmodule RockcutApiWeb.AuthPlug do
  @moduledoc """
  Plug that verifies Bearer token in the Authorization header.
  Loads user by ID, rejects if user is nil or inactive.
  Assigns :current_user on success, halts with 401 on failure.
  """
  import Plug.Conn

  alias RockcutApi.Accounts

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, user_id} <- RockcutApiWeb.SessionController.verify_token(token),
         %Accounts.User{active: true} = user <- Accounts.get_user(user_id) do
      assign(conn, :current_user, user)
    else
      _ ->
        conn
        |> put_status(:unauthorized)
        |> Phoenix.Controller.json(%{error: "Unauthorized"})
        |> halt()
    end
  end
end
