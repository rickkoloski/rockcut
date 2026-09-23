defmodule RockcutApiWeb.OwnerActivityController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [audit_entry: 1]
  alias RockcutApi.{Accounts, Authz}

  def index(conn, _params) do
    actor = conn.assigns.current_user

    if Authz.owner?(actor) do
      json(conn, %{data: Enum.map(Accounts.list_recent_audit(), &audit_entry/1)})
    else
      conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
    end
  end

  # Owner opened the change log → mark it seen (clears their unread badge).
  def seen(conn, _params) do
    actor = conn.assigns.current_user

    if Authz.owner?(actor) do
      {:ok, _} = Accounts.mark_activity_seen(actor)
      send_resp(conn, :no_content, "")
    else
      conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
    end
  end
end
