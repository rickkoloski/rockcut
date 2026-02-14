defmodule RockcutApiWeb.AuthPlug do
  @moduledoc """
  Plug that verifies Bearer token in the Authorization header.
  Assigns :current_user on success, halts with 401 on failure.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, email} <- RockcutApiWeb.SessionController.verify_token(token) do
      assign(conn, :current_user, email)
    else
      _ ->
        conn
        |> put_status(:unauthorized)
        |> Phoenix.Controller.json(%{error: "Unauthorized"})
        |> halt()
    end
  end
end
