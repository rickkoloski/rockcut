defmodule RockcutApiWeb.ShiftTemplateController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [shift_template: 1]
  alias RockcutApi.{Scheduling, Authz}

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Scheduling.list_shift_templates(params), &shift_template/1)})
  end

  def create(conn, params) do
    if manager?(conn) do
      with {:ok, t} <- Scheduling.create_shift_template(params) do
        conn |> put_status(:created) |> json(%{data: shift_template(t)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    if manager?(conn) do
      t = Scheduling.get_shift_template!(id)

      with {:ok, updated} <- Scheduling.update_shift_template(t, Map.drop(params, ["id"])) do
        json(conn, %{data: shift_template(updated)})
      end
    else
      forbidden(conn)
    end
  end

  def delete(conn, %{"id" => id}) do
    if manager?(conn) do
      t = Scheduling.get_shift_template!(id)

      with {:ok, _} <- Scheduling.delete_shift_template(t) do
        json(conn, %{ok: true})
      end
    else
      forbidden(conn)
    end
  end

  defp manager?(conn), do: Authz.can_manage_any?(conn.assigns.current_user)

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
end
