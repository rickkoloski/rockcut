defmodule RockcutApiWeb.Plugs.TaskBoard do
  @moduledoc """
  D41: resolves a task board's `:dept` path param to its department and
  assigns it as `conn.assigns.board`. Runs after `AuthPlug`.

  For now only the Brewery has a board (D41 step 1, the rename): any other
  key halts with 404 JSON. Step 3 opens every assignable department.
  """
  import Plug.Conn
  alias RockcutApi.Accounts
  alias RockcutApi.Accounts.Department

  @boards ~w(brewery)

  def init(opts), do: opts

  def call(%Plug.Conn{path_params: %{"dept" => key}} = conn, _opts) when key in @boards do
    case Accounts.get_department_by_key(key) do
      %Department{} = dept -> assign(conn, :board, dept)
      nil -> not_found(conn)
    end
  end

  def call(conn, _opts), do: not_found(conn)

  defp not_found(conn) do
    conn
    |> put_status(:not_found)
    |> Phoenix.Controller.json(%{error: "not_found", message: "Not found"})
    |> halt()
  end
end
