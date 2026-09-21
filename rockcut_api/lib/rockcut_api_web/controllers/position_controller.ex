defmodule RockcutApiWeb.PositionController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [position: 1]
  alias RockcutApi.{Scheduling, Authz}
  alias RockcutApi.Scheduling.Position

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Scheduling.list_positions(params), &position/1)})
  end

  def create(conn, params) do
    actor = conn.assigns.current_user

    if Authz.can?(actor, :create, %Position{}) do
      with {:ok, pos} <- Scheduling.create_position(params) do
        conn |> put_status(:created) |> json(%{data: position(pos)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    actor = conn.assigns.current_user

    if Authz.can?(actor, :update, %Position{}) do
      pos = Scheduling.get_position!(id)

      with {:ok, updated} <- Scheduling.update_position(pos, Map.drop(params, ["id"])) do
        json(conn, %{data: position(updated)})
      end
    else
      forbidden(conn)
    end
  end

  def delete(conn, %{"id" => id}) do
    actor = conn.assigns.current_user

    if Authz.can?(actor, :delete, %Position{}) do
      pos = Scheduling.get_position!(id)

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
