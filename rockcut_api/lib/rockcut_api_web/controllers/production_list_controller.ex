defmodule RockcutApiWeb.ProductionListController do
  @moduledoc """
  D46 §3.3: the Phases & steps lists. Reads are `:read` on `:production`,
  changes `:setup`. Every list answer is the whole list (active in order,
  then retired).
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [production_phase: 1, production_step_type: 1]

  alias RockcutApi.{Authz, Production}
  alias RockcutApiWeb.ProductionErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/production/phases (with `colors`: the palette's tokens)."
  def phases(conn, _params) do
    with :ok <- allow(conn, :read) do
      json(conn, %{
        data: Enum.map(Production.list_phases(), &production_phase/1),
        colors: RockcutApi.Production.Phase.colors()
      })
    end
    |> ProductionErrors.handle(conn)
  end

  def create_phase(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, phase} <- Production.create_phase(params) do
      conn |> put_status(:created) |> json(%{data: production_phase(phase)})
    end
    |> ProductionErrors.handle(conn)
  end

  def update_phase(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, phase} <- fetch(&Production.get_phase/1, id),
         {:ok, phase} <- Production.update_phase(phase, params) do
      json(conn, %{data: production_phase(phase)})
    end
    |> ProductionErrors.handle(conn)
  end

  def reorder_phases(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, phases} <- Production.reorder_phases(params["ids"]) do
      json(conn, %{data: Enum.map(phases, &production_phase/1)})
    end
    |> ProductionErrors.handle(conn)
  end

  def retire_phase(conn, %{"id" => id}),
    do: change_phase(conn, id, &Production.retire_phase/1)

  def restore_phase(conn, %{"id" => id}),
    do: change_phase(conn, id, &Production.restore_phase/1)

  defp change_phase(conn, id, fun) do
    with :ok <- allow(conn, :setup),
         {:ok, phase} <- fetch(&Production.get_phase/1, id),
         {:ok, phase} <- fun.(phase) do
      json(conn, %{data: production_phase(phase)})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "GET /api/production/step_types."
  def step_types(conn, _params) do
    with :ok <- allow(conn, :read) do
      json(conn, %{data: Enum.map(Production.list_step_types(), &production_step_type/1)})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/step_types: `{ name, full_name?, starts_phase_id?, on_task_list? }`, always `plain`."
  def create_step_type(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, type} <- Production.create_step_type(params) do
      conn |> put_status(:created) |> json(%{data: production_step_type(type)})
    end
    |> ProductionErrors.handle(conn)
  end

  def update_step_type(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :setup),
         {:ok, type} <- fetch(&Production.get_step_type/1, id),
         {:ok, type} <- Production.update_step_type(type, params) do
      json(conn, %{data: production_step_type(type)})
    end
    |> ProductionErrors.handle(conn)
  end

  def reorder_step_types(conn, params) do
    with :ok <- allow(conn, :setup),
         {:ok, types} <- Production.reorder_step_types(params["ids"]) do
      json(conn, %{data: Enum.map(types, &production_step_type/1)})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/step_types/:id: retire (422 `built_in` for the built-in seven)."
  def retire_step_type(conn, %{"id" => id}),
    do: change_step_type(conn, id, &Production.retire_step_type/1)

  def restore_step_type(conn, %{"id" => id}),
    do: change_step_type(conn, id, &Production.restore_step_type/1)

  defp change_step_type(conn, id, fun) do
    with :ok <- allow(conn, :setup),
         {:ok, type} <- fetch(&Production.get_step_type/1, id),
         {:ok, type} <- fun.(type) do
      json(conn, %{data: production_step_type(type)})
    end
    |> ProductionErrors.handle(conn)
  end

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :production),
      do: :ok,
      else: {:error, :forbidden}
  end

  defp fetch(get, id) do
    case get.(id) do
      nil -> {:error, :not_found}
      row -> {:ok, row}
    end
  end
end
