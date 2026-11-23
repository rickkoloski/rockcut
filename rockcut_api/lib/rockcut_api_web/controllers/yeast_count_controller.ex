defmodule RockcutApiWeb.YeastCountController do
  @moduledoc """
  D64 §4.7: cell counts (`/api/yeast/counts`, flat params: `brink_id`,
  `counted_on`, `viable_millions_per_ml`, `viability_pct`, `note`). Add:
  Brewery members and owners; change and delete: the maker or a Brewery
  manager (`Yeast.Counts` asks `Authz`), with the `lock_version` they opened
  (409 when it has changed or is missing). No device.
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Authz
  alias RockcutApi.Yeast.Counts

  action_fallback RockcutApiWeb.FallbackController

  def create(conn, params) do
    with :ok <- allow(conn),
         {:ok, count} <- Counts.create(params, conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: render_count(count)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn),
         %{} = count <- Counts.get(id) || {:error, :not_found},
         {:ok, count} <- Counts.update(count, Map.delete(params, "id"), conn.assigns.current_user) do
      json(conn, %{data: render_count(count)})
    end
  end

  def delete(conn, %{"id" => id} = params) do
    with :ok <- allow(conn),
         %{} = count <- Counts.get(id) || {:error, :not_found},
         {:ok, _} <- Counts.delete(count, params, conn.assigns.current_user) do
      send_resp(conn, :no_content, "")
    end
  end

  defp render_count(c) do
    %{
      id: c.id,
      harvest_id: c.harvest_id,
      counted_on: c.counted_on,
      viable_millions_per_ml: c.viable_millions_per_ml,
      viability_pct: c.viability_pct,
      note: c.note,
      lock_version: c.lock_version,
      entered_by_id: c.entered_by_id
    }
  end

  defp allow(conn) do
    if Authz.can?(conn.assigns.current_user, :write, :ingredients),
      do: :ok,
      else: {:error, :forbidden}
  end
end
