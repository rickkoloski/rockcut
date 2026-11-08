defmodule RockcutApiWeb.Plugs.IdeaBoard do
  @moduledoc """
  D53 Part 2: resolves an Idea Board's `:board` path param and assigns it as
  `conn.assigns.idea_board`: `{:department, dept}` for an assignable
  department's key, `:company` for `company`. `other` and unknown keys halt
  with 404 JSON. Runs after `AuthPlug`; whether this person may use the
  board is `Authz`'s call, in the controllers.
  """
  import Plug.Conn
  alias RockcutApi.IdeaBoards

  def init(opts), do: opts

  def call(%Plug.Conn{path_params: %{"board" => key}} = conn, _opts) do
    case IdeaBoards.board_for_key(key) do
      nil -> not_found(conn)
      board -> assign(conn, :idea_board, board)
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
