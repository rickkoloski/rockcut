defmodule RockcutApiWeb.NotificationPreferenceController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Notifications

  def show(conn, _params) do
    json(conn, %{data: Notifications.get_prefs(conn.assigns.current_user)})
  end

  def update(conn, %{"prefs" => prefs}) when is_map(prefs) do
    case Notifications.update_prefs(conn.assigns.current_user, prefs) do
      {:ok, user} ->
        json(conn, %{data: user.notification_prefs})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not save preferences"})
    end
  end

  def update(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "prefs object required"})
  end
end
