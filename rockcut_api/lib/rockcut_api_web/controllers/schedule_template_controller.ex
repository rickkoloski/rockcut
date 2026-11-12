defmodule RockcutApiWeb.ScheduleTemplateController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [schedule_template: 1]
  alias RockcutApi.{Scheduling, Authz}

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Scheduling.list_schedule_templates(), &schedule_template/1)})
  end

  def create(conn, params) do
    actor = conn.assigns.current_user

    # D58: a manager saves only templates on their departments' positions.
    if Authz.can?(actor, :create, Scheduling.proposed_schedule_template(params)) do
      with {:ok, t} <- Scheduling.create_schedule_template(params, actor) do
        conn |> put_status(:created) |> json(%{data: schedule_template(t)})
      end
    else
      forbidden(conn)
    end
  end

  def delete(conn, %{"id" => id}) do
    t = Scheduling.get_schedule_template!(id)

    if Authz.can?(conn.assigns.current_user, :delete, t) do
      with {:ok, _} <- Scheduling.delete_schedule_template(t) do
        json(conn, %{ok: true})
      end
    else
      forbidden(conn)
    end
  end

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
end
