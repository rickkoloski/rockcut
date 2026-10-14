defmodule RockcutApiWeb.Plugs.TaskBoard do
  @moduledoc """
  D41: resolves a task board's `:dept` path param to its department and
  assigns it as `conn.assigns.board`. Runs after `AuthPlug`.

  Every assignable department has a board (`brewery`, `bar`, `office`,
  `sales`). `other` (scheduling only, not assignable) and unknown keys halt
  with 404 JSON. Whether this person may use the board is `Authz`'s call, in
  the controllers.
  """
  import Plug.Conn
  alias RockcutApi.Accounts
  alias RockcutApi.Accounts.Department

  def init(opts), do: opts

  def call(%Plug.Conn{path_params: %{"dept" => key}} = conn, _opts) do
    case Accounts.get_department_by_key(key) do
      %Department{assignable: true} = dept -> assign(conn, :board, dept)
      _ -> not_found(conn)
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
