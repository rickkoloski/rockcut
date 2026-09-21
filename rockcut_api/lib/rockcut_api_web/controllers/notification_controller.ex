defmodule RockcutApiWeb.NotificationController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [notification: 1]
  alias RockcutApi.Notifications

  def index(conn, _params) do
    user = conn.assigns.current_user

    json(conn, %{
      data: Enum.map(Notifications.list(user), &notification/1),
      unread: Notifications.unread_count(user)
    })
  end

  def unread_count(conn, _params) do
    json(conn, %{count: Notifications.unread_count(conn.assigns.current_user)})
  end

  def read(conn, %{"id" => id}) do
    Notifications.mark_read(conn.assigns.current_user, id)
    json(conn, %{ok: true})
  end

  def read_all(conn, _params) do
    Notifications.mark_all_read(conn.assigns.current_user)
    json(conn, %{ok: true})
  end
end
