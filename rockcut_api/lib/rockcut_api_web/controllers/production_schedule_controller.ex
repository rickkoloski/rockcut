defmodule RockcutApiWeb.ProductionScheduleController do
  @moduledoc """
  D47 §3.15: the schedule (`:read` on `:production`), planning and changing
  batches, and moving, checking off and editing steps (`:write`).

  A write answers the batches it changed as the schedule serializes them
  (`batches`), the P-numbers it changed (`renumbered`), and what the action
  adds (`moved`/`kept`, `out_of_order`, `message`); the client then
  refetches the schedule. Every write also answers `undo_token` (top level,
  `POST /undo/:token` for 2 minutes; `Production.Undo`). Move and complete
  take `preview: true` and answer `{ data: { preview } }` without writing.
  """
  use RockcutApiWeb, :controller

  import Ecto.Query, only: [from: 2]

  import RockcutApiWeb.JSONHelpers,
    only: [production_schedule: 1, production_batch: 1, production_step: 2]

  alias RockcutApi.{Authz, Repo, Tasks}
  alias RockcutApi.Production.{Batches, Cips, Schedule, Signoffs, Step, Steps, Undo}
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
         {:ok, {{batch, renumbered}, token}} <-
           Undo.track(user(conn), %{}, fn -> Batches.plan(params) end, fn {b, _} ->
             %{batches: [b.id]}
           end) do
      conn
      |> put_status(:created)
      |> render_write([batch.id], %{renumbered: renumbered}, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/batches/:id: `volume_bbl`, `batch_number` (brewed)."
  def update_batch(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {_, token}} <-
           Undo.track(user(conn), %{batches: [batch.id]}, fn ->
             Batches.update(batch, Map.take(params, ["volume_bbl", "batch_number"]))
           end) do
      render_write(conn, [batch.id], %{renumbered: []}, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/batches/:id: a planned batch only (`not_planned`)."
  def delete_batch(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {renumbered, token}} <-
           Undo.track(user(conn), %{batches: [batch.id]}, fn -> Batches.delete_planned(batch) end) do
      json(conn, %{
        data: %{deleted_id: batch.id, batches: [], renumbered: renumbered},
        undo_token: token
      })
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/batches/:id/shift: `{ days }`."
  def shift_batch(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {result, token}} <-
           Undo.track(user(conn), %{batches: [batch.id]}, fn ->
             Batches.shift(batch, params["days"])
           end) do
      render_write(conn, [batch.id], result, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/batches/:id/vessels/:index: `{ tank_id }` (null = Unassigned)."
  def update_vessel(conn, %{"id" => id, "index" => index} = params) do
    with :ok <- allow(conn, :write),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {_, token}} <-
           Undo.track(user(conn), %{batches: [batch.id]}, fn ->
             Batches.set_vessel_tank(batch, index, params["tank_id"])
           end) do
      render_write(conn, [batch.id], %{renumbered: []}, token)
    end
    |> ProductionErrors.handle(conn)
  end

  ## Steps

  @doc "POST /api/production/steps/move: `{ ids, days, answer?, preview? }`."
  def move_steps(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, result, token} <-
           tracked(conn, step_scope(params["ids"]), truthy?(params["preview"]), fn preview ->
             Steps.move(params["ids"], params["days"],
               answer: params["answer"],
               preview: preview
             )
           end) do
      render_result(conn, result, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/steps/:id/complete: `{ done_on?, batch_number?,
  answer?, preview? }`.
  """
  def complete_step(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, result, token} <-
           tracked(conn, step_scope([id]), truthy?(params["preview"]), fn preview ->
             Steps.complete(
               id,
               Map.take(params, ["done_on", "batch_number", "answer"]),
               user(conn),
               preview: preview
             )
           end) do
      render_result(conn, result, token)
    end
    |> ProductionErrors.handle(conn)
  end

  def uncomplete_step(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, result, token} <-
           tracked(conn, step_scope([id]), false, fn _ -> Steps.uncomplete(id) end) do
      render_result(conn, result, token)
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
         {:ok, {step, token}} <-
           Undo.track(user(conn), step_scope([step.id]), fn ->
             Steps.update(step, Map.drop(params, ["id"]))
           end) do
      if step.batch_id,
        do: render_write(conn, [step.batch_id], %{renumbered: []}, token),
        else: render_cip(conn, step, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/steps/assign: `{ ids, assignee_id }` (null = nobody)."
  def assign_steps(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, result, token} <-
           tracked(conn, step_scope(params["ids"]), false, fn _ ->
             Steps.assign(params["ids"], params["assignee_id"])
           end) do
      render_result(conn, Map.put(result, :renumbered, []), token)
    end
    |> ProductionErrors.handle(conn)
  end

  ## Standalone CIP & Sanitize (§3.10)

  @doc """
  POST /api/production/cips: `{ tank_id, due_on, already_done?, notes?,
  assignee_id? }`. Moving one is `POST /steps/move` (no prompt: nothing
  follows it); checking off `POST /cips/:id/complete` or the steps route.
  """
  def create_cip(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, {cip, token}} <-
           Undo.track(
             user(conn),
             %{},
             fn -> Cips.create(params, user(conn)) end,
             &%{steps: [&1.id]}
           ) do
      conn |> put_status(:created) |> render_cip(cip, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/cips/:id: `tank_id`, `notes`, `assignee_id`."
  def update_cip(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, cip} <- fetch_cip(id),
         {:ok, {cip, token}} <-
           Undo.track(user(conn), %{steps: [cip.id]}, fn -> Cips.update(cip, params) end) do
      render_cip(conn, cip, token)
    end
    |> ProductionErrors.handle(conn)
  end

  def delete_cip(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, cip} <- fetch_cip(id),
         {:ok, {_, token}} <-
           Undo.track(user(conn), %{steps: [cip.id]}, fn -> Cips.delete(cip) end) do
      json(conn, %{data: %{deleted_id: cip.id, batches: []}, undo_token: token})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/cips/:id/complete: `{ done_on? }`."
  def complete_cip(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, _} <- fetch_cip(id) do
      complete_step(conn, params)
    end
    |> ProductionErrors.handle(conn)
  end

  def uncomplete_cip(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, _} <- fetch_cip(id) do
      uncomplete_step(conn, params)
    end
    |> ProductionErrors.handle(conn)
  end

  ## Flags (§3.9)

  @doc "POST /api/production/flags/signoff: `{ key, signature, note? }` (Mark OK)."
  def sign_off(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, {_, token}} <-
           Undo.track(user(conn), %{signoffs: [params["key"]]}, fn ->
             Signoffs.sign_off(params, user(conn))
           end) do
      json(conn, %{data: %{key: params["key"]}, undo_token: token})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/flags/signoff/:key: Remove sign-off."
  def remove_signoff(conn, %{"key" => key}) do
    with :ok <- allow(conn, :write),
         %{} = signoff <- Signoffs.get_by_key(key) || {:error, :not_found},
         {:ok, {_, token}} <-
           Undo.track(user(conn), %{signoffs: [key]}, fn -> Signoffs.remove(signoff) end) do
      json(conn, %{data: %{key: key}, undo_token: token})
    end
    |> ProductionErrors.handle(conn)
  end

  ## Undo

  @doc """
  POST /api/production/undo/:token: put back what that write changed (the
  person who made it, within 2 minutes). 409 `undo_stale` when something
  changed since; 422 `undo_expired`.
  """
  def undo(conn, %{"token" => token}) do
    with :ok <- allow(conn, :write),
         {:ok, %{batch_ids: ids}} <- Undo.undo(user(conn), token) do
      render_write(conn, existing_batches(ids), %{renumbered: []}, nil)
    end
    |> ProductionErrors.handle(conn)
  end

  ## Helpers

  # A step write with Undo, or its preview without.
  defp tracked(_conn, _scope, true, fun) do
    with {:ok, result} <- fun.(true), do: {:ok, result, nil}
  end

  defp tracked(conn, scope, false, fun) do
    with {:ok, {result, token}} <- Undo.track(user(conn), scope, fn -> fun.(false) end),
         do: {:ok, result, token}
  end

  # The rows a step write may touch: the steps' batches, or the standalone steps.
  defp step_scope(ids) when is_list(ids) do
    ids = ids |> Enum.map(&Batches.to_int/1) |> Enum.reject(&is_nil/1)
    rows = Repo.all(from(s in Step, where: s.id in ^ids, select: {s.id, s.batch_id}))

    %{
      batches: for({_, b} <- rows, b != nil, uniq: true, do: b),
      steps: for({id, nil} <- rows, do: id)
    }
  end

  defp step_scope(_), do: %{}

  defp existing_batches(ids),
    do: Repo.all(from(b in RockcutApi.Brewing.Batch, where: b.id in ^ids, select: b.id))

  defp render_result(conn, {:preview, preview}, _token),
    do: json(conn, %{data: %{preview: preview}})

  defp render_result(conn, %{batch_ids: ids} = result, token),
    do: render_write(conn, ids, Map.delete(result, :batch_ids), token)

  defp render_write(conn, batch_ids, extra, token) do
    batches = batch_ids |> Schedule.batches() |> Enum.map(&production_batch/1)
    json(conn, %{data: Map.put(extra, :batches, batches), undo_token: token})
  end

  defp render_cip(conn, cip, token) do
    cip = Repo.preload(cip, [:step_type, :phase, :assignee, :done_by], force: true)

    json(conn, %{
      data: %{batches: [], cip: production_step(cip, []), renumbered: []},
      undo_token: token
    })
  end

  defp fetch_cip(id) do
    case Cips.get(id) do
      nil -> {:error, :not_found}
      cip -> {:ok, cip}
    end
  end

  defp user(conn), do: conn.assigns.current_user

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
