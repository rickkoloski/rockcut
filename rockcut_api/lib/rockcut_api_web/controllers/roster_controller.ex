defmodule RockcutApiWeb.RosterController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Accounts

  # Minimal staff roster (id, name, departments) for schedule display —
  # readable by any authenticated user.
  def index(conn, _params) do
    json(conn, %{data: Accounts.list_roster()})
  end
end
