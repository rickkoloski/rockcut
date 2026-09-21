defmodule RockcutApiWeb.ModuleAccessPlug do
  @moduledoc """
  Gates a route scope by module access. Runs after `AuthPlug` (needs
  `conn.assigns.current_user`).

  Options:
    * `module:` — a department key atom (e.g. `:brewery`); owner or any member
      of that department passes.
    * `shared: true` — any authenticated user passes (a global module such as
      the schedule).

  Halts with 403 JSON otherwise.
  """
  import Plug.Conn
  alias RockcutApi.Authz

  def init(opts), do: opts

  def call(conn, opts) do
    user = conn.assigns[:current_user]

    cond do
      Keyword.get(opts, :shared, false) and not is_nil(user) ->
        conn

      user && (Authz.owner?(user) or member_allowed?(user, opts)) ->
        conn

      true ->
        conn
        |> put_status(:forbidden)
        |> Phoenix.Controller.json(%{error: "Forbidden"})
        |> halt()
    end
  end

  defp member_allowed?(user, opts) do
    case Keyword.get(opts, :module) do
      nil -> false
      module -> Authz.member_of?(user, Atom.to_string(module))
    end
  end
end
