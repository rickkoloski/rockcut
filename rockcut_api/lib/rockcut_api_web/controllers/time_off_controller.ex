defmodule RockcutApiWeb.TimeOffController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [time_off_request: 1]
  alias RockcutApi.TimeOff
  alias RockcutApi.TimeOff.Request

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    requests = TimeOff.list_for(conn.assigns.current_user, params)
    json(conn, %{data: Enum.map(requests, &time_off_request/1)})
  end

  def create(conn, params) do
    with {:ok, req} <- TimeOff.create(params, conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: time_off_request(req)})
    end
  end

  def review(conn, %{"id" => id} = params) do
    case TimeOff.get(id) do
      nil ->
        {:error, :not_found}

      %Request{} = req ->
        case TimeOff.review(
               req,
               conn.assigns.current_user,
               params["status"],
               params["reviewer_note"]
             ) do
          {:ok, updated} -> json(conn, %{data: time_off_request(updated)})
          {:error, :forbidden} -> forbidden(conn)
          {:error, :invalid_status} -> unprocessable(conn, "status must be approved or denied")
          other -> other
        end
    end
  end

  def cancel(conn, %{"id" => id}) do
    case TimeOff.get(id) do
      nil ->
        {:error, :not_found}

      %Request{} = req ->
        case TimeOff.cancel(req, conn.assigns.current_user) do
          {:ok, updated} -> json(conn, %{data: time_off_request(updated)})
          {:error, :forbidden} -> forbidden(conn)
          {:error, :not_pending} -> unprocessable(conn, "only pending requests can be cancelled")
          other -> other
        end
    end
  end

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})

  defp unprocessable(conn, msg),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: msg})
end
