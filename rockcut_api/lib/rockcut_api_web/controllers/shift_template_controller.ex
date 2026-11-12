defmodule RockcutApiWeb.ShiftTemplateController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [shift_template: 1]
  alias RockcutApi.{Scheduling, Authz}
  alias RockcutApi.Scheduling.ShiftTemplate

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Scheduling.list_shift_templates(params), &shift_template/1)})
  end

  # D58: a manager writes only templates on their departments' positions
  # (owners pass); changing the position asks for both.
  def create(conn, params) do
    if can?(conn, :create, Scheduling.proposed_shift_template(params)) do
      with {:ok, t} <- Scheduling.create_shift_template(params) do
        conn |> put_status(:created) |> json(%{data: shift_template(t)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    t = Scheduling.get_shift_template!(id)

    moved_to =
      if Map.has_key?(params, "position_id"),
        do: Scheduling.proposed_shift_template(params),
        else: t

    if can?(conn, :update, t) and can?(conn, :update, moved_to) do
      with {:ok, updated} <- Scheduling.update_shift_template(t, Map.drop(params, ["id"])) do
        json(conn, %{data: shift_template(updated)})
      end
    else
      forbidden(conn)
    end
  end

  def delete(conn, %{"id" => id}) do
    t = Scheduling.get_shift_template!(id)

    if can?(conn, :delete, t) do
      with {:ok, _} <- Scheduling.delete_shift_template(t) do
        json(conn, %{ok: true})
      end
    else
      forbidden(conn)
    end
  end

  defp can?(conn, action, %ShiftTemplate{} = t),
    do: Authz.can?(conn.assigns.current_user, action, t)

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
end
