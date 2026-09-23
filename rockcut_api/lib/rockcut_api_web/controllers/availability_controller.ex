defmodule RockcutApiWeb.AvailabilityController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [availability_slot: 1]
  alias RockcutApi.Availability
  alias RockcutApi.Availability.Slot

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    slots = Availability.list_for(conn.assigns.current_user, params)
    json(conn, %{data: Enum.map(slots, &availability_slot/1)})
  end

  def create(conn, params) do
    case Availability.create(params, conn.assigns.current_user) do
      {:ok, slot} -> conn |> put_status(:created) |> json(%{data: availability_slot(slot)})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
      other -> other
    end
  end

  def delete(conn, %{"id" => id}) do
    case Availability.get(id) do
      nil ->
        {:error, :not_found}

      %Slot{} = slot ->
        case Availability.delete(slot, conn.assigns.current_user) do
          {:ok, _} -> send_resp(conn, :no_content, "")
          {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
          other -> other
        end
    end
  end
end
