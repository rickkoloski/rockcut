defmodule RockcutApiWeb.ShiftTemplateController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [shift_template: 1]
  alias RockcutApi.{Scheduling, Authz}
  alias RockcutApi.Scheduling.ShiftTemplate

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Scheduling.list_shift_templates(params), &shift_template/1)})
  end

  def create(conn, params) do
    if can?(conn, :create) do
      with {:ok, t} <- Scheduling.create_shift_template(params) do
        conn |> put_status(:created) |> json(%{data: shift_template(t)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    if can?(conn, :update) do
      t = Scheduling.get_shift_template!(id)

      with {:ok, updated} <- Scheduling.update_shift_template(t, Map.drop(params, ["id"])) do
        json(conn, %{data: shift_template(updated)})
      end
    else
      forbidden(conn)
    end
  end

  def delete(conn, %{"id" => id}) do
    if can?(conn, :delete) do
      t = Scheduling.get_shift_template!(id)

      with {:ok, _} <- Scheduling.delete_shift_template(t) do
        json(conn, %{ok: true})
      end
    else
      forbidden(conn)
    end
  end

  defp can?(conn, action), do: Authz.can?(conn.assigns.current_user, action, %ShiftTemplate{})

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
end
