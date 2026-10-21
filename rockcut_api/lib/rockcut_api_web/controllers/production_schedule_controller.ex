defmodule RockcutApiWeb.ProductionScheduleController do
  @moduledoc """
  D47 §3.15: the schedule (`:read` on `:production`), planning and changing
  batches, and moving, checking off and editing steps (`:write`).

  A write answers the batches it changed as the schedule serializes them
  (`batches`), the P-numbers it changed (`renumbered`), and what the action
  adds (`moved`/`kept`, `out_of_order`, `message`); the client then
  refetches the schedule. Move and complete take `preview: true` and answer
  `{ data: { preview } }` without writing.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers,
    only: [production_schedule: 1, production_batch: 1, production_step: 2]

  alias RockcutApi.{Authz, Repo, Tasks}
  alias RockcutApi.Production.{Batches, Schedule, Step, Steps}
  alias RockcutApiWeb.ProductionErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/production/schedule?from&to (default: today − 7 days … + 35)."
  def show(conn, params) do
    today = Tasks.today()

    with :ok <- allow(conn, :read),
         {:ok, from} <- date(params["from"], Date.add(today, -7)),
         {:ok, to} <- date(params["to"], Date.add(today, 35)),
         {:ok, sched} <- Schedule.load(from, to, today) do
      json(conn, %{data: production_schedule(sched)})
    end
    |> ProductionErrors.handle(conn)
  end

  ## Batches

  @doc """
  POST /api/production/batches: `{ brand_id, template_id, brew_on,
  volume_bbl, brew_two_days?, tank_ids? }` (one tank id or null per vessel).
  """
  def create_batch(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, {batch, renumbered}} <- Batches.plan(params) do
      conn |> put_status(:created) |> render_write([batch.id], %{renumbered: renumbered})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/batches/:id: `volume_bbl`, `batch_number` (brewed)."
  def update_batch(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, _} <- Batches.update(batch, Map.take(params, ["volume_bbl", "batch_number"])) do
      render_write(conn, [batch.id], %{renumbered: []})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/batches/:id: a planned batch only (`not_planned`)."
  def delete_batch(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, renumbered} <- Batches.delete_planned(batch) do
      json(conn, %{data: %{deleted_id: batch.id, batches: [], renumbered: renumbered}})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/batches/:id/shift: `{ days }`."
  def shift_batch(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, result} <- Batches.shift(batch, params["days"]) do
      render_write(conn, [batch.id], result)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/batches/:id/vessels/:index: `{ tank_id }` (null = Unassigned)."
  def update_vessel(conn, %{"id" => id, "index" => index} = params) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, _} <- Batches.set_vessel_tank(batch, index, params["tank_id"]) do
      render_write(conn, [batch.id], %{renumbered: []})
    end
    |> ProductionErrors.handle(conn)
  end

  ## Steps

  @doc "POST /api/production/steps/move: `{ ids, days, answer?, preview? }`."
  def move_steps(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, result} <-
           Steps.move(params["ids"], params["days"],
             answer: params["answer"],
             preview: truthy?(params["preview"])
           ) do
      render_result(conn, result)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/steps/:id/complete: `{ done_on?, batch_number?,
  answer?, preview? }`.
  """
  def complete_step(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, result} <-
           Steps.complete(
             id,
             Map.take(params, ["done_on", "batch_number", "answer"]),
             conn.assigns.current_user,
             preview: truthy?(params["preview"])
           ) do
      render_result(conn, result)
    end
    |> ProductionErrors.handle(conn)
  end

  def uncomplete_step(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, result} <- Steps.uncomplete(id) do
      render_result(conn, result)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  PATCH /api/production/steps/:id: `detail`, `temperature`,
  `package_partial`, `notes`, `on_task_list`, `assignee_id`. A standalone
  CIP answers `step`.
  """
  def update_step(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, step} <- fetch_step(id),
         {:ok, step} <- Steps.update(step, Map.drop(params, ["id"])) do
      if step.batch_id do
        render_write(conn, [step.batch_id], %{renumbered: []})
      else
        step = Repo.preload(step, [:step_type, :phase, :assignee, :done_by], force: true)
        json(conn, %{data: %{batches: [], step: production_step(step, []), renumbered: []}})
      end
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/steps/assign: `{ ids, assignee_id }` (null = nobody)."
  def assign_steps(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, result} <- Steps.assign(params["ids"], params["assignee_id"]) do
      render_result(conn, Map.put(result, :renumbered, []))
    end
    |> ProductionErrors.handle(conn)
  end

  ## Helpers

  defp render_result(conn, {:preview, preview}), do: json(conn, %{data: %{preview: preview}})

  defp render_result(conn, %{batch_ids: ids} = result),
    do: render_write(conn, ids, Map.delete(result, :batch_ids))

  defp render_write(conn, batch_ids, extra) do
    batches = batch_ids |> Schedule.batches() |> Enum.map(&production_batch/1)
    json(conn, %{data: Map.put(extra, :batches, batches)})
  end

  defp fetch_batch(id) do
    case Batches.get(id) do
      nil -> {:error, :not_found}
      batch -> {:ok, batch}
    end
  end

  defp fetch_step(id) do
    case Batches.to_int(id) && Repo.get(Step, Batches.to_int(id)) do
      %Step{} = step -> {:ok, step}
      _ -> {:error, :not_found}
    end
  end

  defp date(nil, default), do: {:ok, default}
  defp date("", default), do: {:ok, default}

  defp date(value, _default) do
    case Date.from_iso8601(value) do
      {:ok, d} -> {:ok, d}
      _ -> {:error, :range_invalid}
    end
  end

  defp truthy?(v), do: v in [true, "true", 1, "1"]

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :production),
      do: :ok,
      else: {:error, :forbidden}
  end
end
