defmodule RockcutApiWeb.PositionController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [position: 1]
  alias RockcutApi.{Scheduling, Authz}
  alias RockcutApi.Scheduling.Position

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Scheduling.list_positions(params), &position/1)})
  end

  # D58 (5769): writes need the position's department managed (owners pass);
  # create asks for the requested department, a move for both.
  def create(conn, params) do
    actor = conn.assigns.current_user
    dept_id = RockcutApi.Ids.parse(params["department_id"])

    if Authz.can?(actor, :create, %Position{department_id: dept_id}) do
      with {:ok, pos} <- Scheduling.create_position(params) do
        conn |> put_status(:created) |> json(%{data: position(pos)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    actor = conn.assigns.current_user
    pos = Scheduling.get_position!(id)

    moved_to =
      if Map.has_key?(params, "department_id"),
        do: %Position{department_id: RockcutApi.Ids.parse(params["department_id"])},
        else: pos

    if Authz.can?(actor, :update, pos) and Authz.can?(actor, :update, moved_to) do
      with {:ok, updated} <- Scheduling.update_position(pos, Map.drop(params, ["id"])) do
        json(conn, %{data: position(updated)})
      end
    else
      forbidden(conn)
    end
  end

  def delete(conn, %{"id" => id}) do
    actor = conn.assigns.current_user
    pos = Scheduling.get_position!(id)

    if Authz.can?(actor, :delete, pos) do
      case Scheduling.deactivate_or_delete_position(pos) do
        {:ok, :deleted} -> json(conn, %{ok: true, deleted: true})
        {:ok, updated} -> json(conn, %{data: position(updated), deactivated: true})
        other -> other
      end
    else
      forbidden(conn)
    end
  end

  defp forbidden(conn) do
    conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
  end
end
