defmodule RockcutApiWeb.RequireAdminPlug do
  @moduledoc """
  Plug that requires the current user to have the "admin" role.
  Returns 403 Forbidden if the user is not an admin.
  """
  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    case conn.assigns[:current_user] do
      %{role: "admin"} ->
        conn

      _ ->
        conn
        |> put_status(:forbidden)
        |> Phoenix.Controller.json(%{error: "Forbidden"})
        |> halt()
    end
  end
end
