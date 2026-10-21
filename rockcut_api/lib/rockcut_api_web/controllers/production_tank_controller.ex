defmodule RockcutApiWeb.ProductionTankController do
  @moduledoc """
  D46 §3.2: tanks (`:setup` on `:production`) and their out-of-service
  periods (`:write`, a schedule change). Reads are `:read`. Lists carry
  `today` (Colorado) and each period's `state` for it.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [production_tank: 2, tank_outage: 2]

  alias RockcutApi.{Authz, Production, Tasks}
  alias RockcutApiWeb.ProductionErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/production/tanks: active tanks in order, then retired ones."
  def index(conn, _params) do
    with :ok <- allow(conn, :read) do
      render_tanks(conn, Production.list_tanks())
    end
    |> ProductionErrors.handle(conn)
  end

  def create(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, tank} <- Production.create_tank(params) do
      conn |> put_status(:created) |> render_tank(tank)
    end
    |> ProductionErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, tank} <- fetch(&Production.get_tank/1, id),
         {:ok, tank} <- Production.update_tank(tank, params) do
      render_tank(conn, tank)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/tanks/reorder: `{ ids: [...] }`, exactly the active tanks."
  def reorder(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, tanks} <- Production.reorder_tanks(params["ids"]) do
      render_tanks(conn, tanks)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/tanks/:id: retire (422 `tank_in_use` with the batches)."
  def retire(conn, %{"id" => id}) do
    with :ok <- allow(conn, :setup),
         {:ok, tank} <- fetch(&Production.get_tank/1, id),
         {:ok, tank} <- Production.retire_tank(tank) do
      render_tank(conn, tank)
    end
    |> ProductionErrors.handle(conn)
  end

  def restore(conn, %{"id" => id}) do
    with :ok <- allow(conn, :setup),
         {:ok, tank} <- fetch(&Production.get_tank/1, id),
         {:ok, tank} <- Production.restore_tank(tank) do
      render_tank(conn, tank)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/tanks/:id/outages: `{ starts_on, ends_on?, reason? }`
  (no `ends_on` = until further notice). 422 `outage_overlap` names the other
  period. Answers the tank.
  """
  def create_outage(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, tank} <- fetch(&Production.get_tank/1, id),
         {:ok, outage} <- Production.create_outage(tank, params, actor(conn)) do
      conn |> put_status(:created) |> render_outage(outage)
    end
    |> ProductionErrors.handle(conn)
  end

  def update_outage(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, outage} <- fetch(&Production.get_outage/1, id),
         {:ok, outage} <- Production.update_outage(outage, Map.delete(params, "id")) do
      render_outage(conn, outage)
    end
    |> ProductionErrors.handle(conn)
  end

  def delete_outage(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, outage} <- fetch(&Production.get_outage/1, id),
         {:ok, :deleted} <- Production.delete_outage(outage) do
      render_tank(conn, Production.get_tank(outage.tank_id))
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/outages/:id/end_today: Back in service today (the
  period ends yesterday, or goes if it started today). Answers the tank.
  """
  def end_outage_today(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, outage} <- fetch(&Production.get_outage/1, id),
         {:ok, _} <- Production.end_outage_today(outage) do
      render_tank(conn, Production.get_tank(outage.tank_id))
    end
    |> ProductionErrors.handle(conn)
  end

  defp render_tanks(conn, tanks) do
    today = Tasks.today()
    json(conn, %{data: Enum.map(tanks, &production_tank(&1, today)), today: today})
  end

  defp render_tank(conn, tank),
    do: json(conn, %{data: production_tank(tank, Tasks.today())})

  defp render_outage(conn, outage) do
    today = Tasks.today()

    json(conn, %{
      data: tank_outage(outage, today),
      tank: production_tank(Production.get_tank(outage.tank_id), today)
    })
  end

  defp allow(conn, action) do
    if Authz.can?(actor(conn), action, :production), do: :ok, else: {:error, :forbidden}
  end

  defp fetch(get, id) do
    case get.(id) do
      nil -> {:error, :not_found}
      row -> {:ok, row}
    end
  end

  defp actor(conn), do: conn.assigns.current_user
end
