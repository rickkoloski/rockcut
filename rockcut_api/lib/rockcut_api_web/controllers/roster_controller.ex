defmodule RockcutApiWeb.RosterController do
  use RockcutApiWeb, :controller

  alias RockcutApi.{Accounts, Authz}

  # Minimal staff roster (id, name, departments) for schedule display —
  # readable by any authenticated user.
  def index(conn, _params) do
    json(conn, %{data: Accounts.list_roster()})
  end

  # Save the schedule display order (manager/owner). Body: {"user_ids": [...]}.
  def order(conn, %{"user_ids" => user_ids}) when is_list(user_ids) do
    if Authz.can_manage_any?(conn.assigns.current_user) do
      Accounts.reorder_roster(user_ids)
      json(conn, %{data: Accounts.list_roster()})
    else
      conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
    end
  end
end
