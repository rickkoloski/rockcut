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

  D50: the brewhouse device (a shared device at home in the Brewery) reads
  and writes all of it. Each write needs a person's `staff_code` and is
  made as that person (`StaffCodeActing`), with the device recorded beside
  them; the answer carries `recorded_as`. Undo is that person's only.
  """
  use RockcutApiWeb, :controller

  import Ecto.Query, only: [from: 2]

  import RockcutApiWeb.JSONHelpers,
    only: [
      production_schedule: 1,
      production_batch: 1,
      production_step: 2,
      production_condition_mark: 1,
      for_viewer: 2
    ]

  alias RockcutApi.{Authz, Repo, Tasks}
  alias RockcutApi.Production

  alias RockcutApi.Production.{
    BatchChanges,
    Batches,
    Cips,
    ConditionMarks,
    Schedule,
    Signoffs,
    Splits,
    Step,
    StepLinks,
    Steps,
    Undo
  }

  alias RockcutApiWeb.{ProductionErrors, StaffCodeActing}

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/production/schedule?from&to (default: today − 7 days … + 35)."
  def show(conn, params) do
    today = Tasks.today()

    with :ok <- allow(conn, :read),
         {:ok, from} <- date(params["from"], Date.add(today, -7)),
         {:ok, to} <- date(params["to"], Date.add(today, 35)),
         {:ok, sched} <- Schedule.load(from, to, today) do
      reply(conn, %{data: production_schedule(sched)})
    end
    |> ProductionErrors.handle(conn)
  end

  ## Batches

  @doc """
  POST /api/production/batches: `{ brand_id, template_id, brew_on,
  volume_bbl, brew_two_days?, tank_ids?, pencilled? }` (one tank id or null
  per vessel; D49: `pencilled` pencils it in).
  """
  def create_batch(conn, params) do
    with {:ok, conn} <- writer(conn),
         {:ok, {{batch, renumbered}, token}} <-
           Undo.track(actor(conn), %{}, fn -> Batches.plan(params) end, fn {b, _} ->
             %{batches: [b.id]}
           end) do
      conn
      |> put_status(:created)
      |> render_write([batch.id], %{renumbered: renumbered}, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  PATCH /api/production/batches/:id: `volume_bbl`, `batch_number` (brewed),
  and while planned `brand_id` and `template_id` (D48: the steps are
  rebuilt; `message` says what was kept).
  """
  def update_batch(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {extra, token}} <-
           Undo.track(actor(conn), %{batches: [batch.id]}, fn ->
             change_batch(batch, params)
           end) do
      render_write(conn, [batch.id], extra, token)
    end
    |> ProductionErrors.handle(conn)
  end

  defp change_batch(batch, params) do
    Repo.transaction(fn ->
      extra =
        if Map.has_key?(params, "template_id"),
          do: ok!(BatchChanges.change_template(batch, params["template_id"])),
          else: %{renumbered: []}

      if Map.has_key?(params, "brand_id"),
        do: ok!(BatchChanges.change_brand(Batches.get(batch.id), params["brand_id"]))

      ok!(Batches.update(Batches.get(batch.id), Map.take(params, ["volume_bbl", "batch_number"])))
      Map.take(extra, [:renumbered, :message])
    end)
  end

  defp ok!({:ok, result}), do: result
  defp ok!({:error, reason}), do: Repo.rollback(reason)

  ## Changing a batch (D48 §3.11)

  @doc """
  POST /api/production/batches/:id/steps: `{ step_type_id | name, due_on,
  vessel_index?, detail?, temperature?, package_partial?, notes?,
  on_task_list?, assignee_id?, comes_after_id?, comes_after_answer?,
  leads_to_id?, leads_to_answer? }`. Answers `step_ids` (the new steps).
  """
  def add_step(conn, %{"id" => id} = params) do
    batch_write(conn, id, &BatchChanges.add_step(&1, Map.drop(params, ["id"])), :created)
  end

  @doc """
  POST /api/production/batches/:id/ramp: `{ start, target, change_per_day,
  first_on, vessel_index?, phase_id?, on_task_list?, assignee_id?,
  comes_after_id?, leads_to_id? }`.
  """
  def add_ramp(conn, %{"id" => id} = params) do
    batch_write(conn, id, &BatchChanges.add_ramp(&1, Map.drop(params, ["id"])), :created)
  end

  @doc """
  POST /api/production/batches/:id/transfers: `{ step_type_id?, due_on,
  tank_id?, notes?, assignee_id? }` (Transfer or Filter). Answers `moved`.
  """
  def add_transfer(conn, %{"id" => id} = params) do
    batch_write(conn, id, &BatchChanges.add_transfer(&1, Map.drop(params, ["id"])), :created)
  end

  @doc "DELETE /api/production/batches/:id/transfers/:step_id: the beer stays in the tank before it."
  def remove_transfer(conn, %{"id" => id, "step_id" => step_id}) do
    with {:ok, conn} <- writer(conn),
         {:ok, batch} <- fetch_batch(id),
         {:ok, step} <- fetch_step(step_id),
         true <- (step.batch_id == batch.id and transfer?(step)) || {:error, :not_found} do
      remove_step(conn, %{"id" => step_id})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/steps/:id: an unfinished step (not Brew day); links pass through."
  def remove_step(conn, %{"id" => id}) do
    with {:ok, conn} <- writer(conn),
         {:ok, step} <- fetch_step(id),
         {:ok, result, token} <-
           tracked(conn, step_scope([step.id]), false, fn _ -> BatchChanges.remove_step(step) end) do
      render_result(conn, Map.put(result, :renumbered, []), token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/steps/:id/ramp: `{ target?, change_per_day? }` (Change ramp…)."
  def change_ramp(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, step} <- fetch_step(id),
         {:ok, result, token} <-
           tracked(conn, step_scope([step.id]), false, fn _ ->
             BatchChanges.change_ramp(step, Map.drop(params, ["id"]))
           end) do
      render_result(conn, Map.put(result, :renumbered, []), token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/batches/:id/split: `{ due_on, split_method?, parts:
  [{ tank_id?, stays?, volume_bbl }] }`. Answers the parent and its parts
  (`part_ids`).
  """
  def split(conn, %{"id" => id} = params) do
    batch_write(conn, id, &Splits.split(&1, Map.drop(params, ["id"])), :created)
  end

  @doc "DELETE /api/production/batches/:id/split (the parent or a part): Undo split."
  def undo_split(conn, %{"id" => id}) do
    batch_write(conn, id, &Splits.undo_split/1, :ok)
  end

  ## Clean / dirty marks (D48 §3.8)

  @doc """
  POST /api/production/tanks/:id/condition: `{ state, marked_on?, note? }`.
  422 `tank_in_use` while beer is in it, `date_invalid` for a future day or
  one before its last emptying.
  """
  def mark_condition(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         %{} = tank <- Production.get_tank(id) || {:error, :not_found},
         {:ok, {mark, token}} <-
           Undo.track(
             actor(conn),
             %{},
             fn -> ConditionMarks.create(tank, Map.drop(params, ["id"]), actor(conn)) end,
             &%{marks: [&1.id]}
           ) do
      conn
      |> put_status(:created)
      |> reply(%{data: %{mark: production_condition_mark(mark), batches: []}, undo_token: token})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/condition_marks/:id: History → Remove."
  def remove_condition_mark(conn, %{"id" => id}) do
    with {:ok, conn} <- writer(conn),
         %{} = mark <- ConditionMarks.get(id) || {:error, :not_found},
         {:ok, {_, token}} <-
           Undo.track(actor(conn), %{marks: [mark.id]}, fn -> ConditionMarks.delete(mark) end) do
      reply(conn, %{data: %{deleted_id: mark.id, batches: []}, undo_token: token})
    end
    |> ProductionErrors.handle(conn)
  end

  defp batch_write(conn, id, fun, status) do
    with {:ok, conn} <- writer(conn),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {result, token}} <-
           Undo.track(actor(conn), %{batches: [batch.id]}, fn -> fun.(batch) end) do
      conn
      |> put_status(status)
      |> render_result(Map.put(result, :renumbered, []), token)
    end
    |> ProductionErrors.handle(conn)
  end

  defp transfer?(step),
    do: Steps.behavior(Repo.preload(step, :step_type)) == "transfer"

  @doc "DELETE /api/production/batches/:id: a planned batch only (`not_planned`)."
  def delete_batch(conn, %{"id" => id}) do
    with {:ok, conn} <- writer(conn),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {renumbered, token}} <-
           Undo.track(actor(conn), %{batches: [batch.id]}, fn -> Batches.delete_planned(batch) end) do
      reply(conn, %{
        data: %{deleted_id: batch.id, batches: [], renumbered: renumbered},
        undo_token: token
      })
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  POST /api/production/batches/:id/schedule and /pencil (D49 §3.12b): a
  pencilled batch scheduled, or a scheduled planned one pencilled in (the
  whole split; `step_done` once a step is done).
  """
  def schedule_batch(conn, %{"id" => id}), do: pencil_write(conn, id, &Batches.schedule/1)
  def pencil_batch(conn, %{"id" => id}), do: pencil_write(conn, id, &Batches.pencil/1)

  defp pencil_write(conn, id, fun) do
    with {:ok, conn} <- writer(conn),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {{_, renumbered}, token}} <-
           Undo.track(actor(conn), %{batches: [batch.id]}, fn -> fun.(batch) end) do
      root = batch.split_parent_id || batch.id

      ids = [
        root
        | Repo.all(
            from(b in RockcutApi.Brewing.Batch, where: b.split_parent_id == ^root, select: b.id)
          )
      ]

      render_write(conn, ids, %{renumbered: renumbered}, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/batches/:id/shift: `{ days }`."
  def shift_batch(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {result, token}} <-
           Undo.track(actor(conn), %{batches: [batch.id]}, fn ->
             Batches.shift(batch, params["days"])
           end) do
      render_write(conn, [batch.id], result, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/batches/:id/vessels/:index: `{ tank_id }` (null = Unassigned)."
  def update_vessel(conn, %{"id" => id, "index" => index} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, batch} <- fetch_batch(id),
         {:ok, {_, token}} <-
           Undo.track(actor(conn), %{batches: [batch.id]}, fn ->
             Batches.set_vessel_tank(batch, index, params["tank_id"])
           end) do
      render_write(conn, [batch.id], %{renumbered: []}, token)
    end
    |> ProductionErrors.handle(conn)
  end

  ## Steps

  @doc "POST /api/production/steps/move: `{ ids, days, answer?, preview? }`."
  def move_steps(conn, params) do
    with {:ok, conn} <- writer(conn),
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
  answer?, result?, fail_action?, retest_days?, preview? }` (D56: `result`
  `pass` / `fail` on a step whose type has one; a Fail's `fail_action`
  `retest` / `continue`, `retest_days` 1–30).
  """
  def complete_step(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, result, token} <-
           tracked(conn, step_scope([id]), truthy?(params["preview"]), fn preview ->
             Steps.complete(
               id,
               Map.take(params, Steps.complete_fields()),
               actor(conn),
               preview: preview
             )
           end) do
      render_result(conn, result, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc """
  PATCH /api/production/steps/:id/result: `{ result, fail_action?,
  retest_days?, answer?, preview? }` (D56 §3.2, a done step's Pass / Fail).
  """
  def change_result(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, result, token} <-
           tracked(conn, step_scope([id]), truthy?(params["preview"]), fn preview ->
             Steps.change_result(
               id,
               Map.take(params, ~w(result fail_action retest_days answer)),
               preview: preview
             )
           end) do
      render_result(conn, result, token)
    end
    |> ProductionErrors.handle(conn)
  end

  def uncomplete_step(conn, %{"id" => id}) do
    with {:ok, conn} <- writer(conn),
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
    with {:ok, conn} <- writer(conn),
         {:ok, step} <- fetch_step(id),
         {:ok, {step, token}} <-
           Undo.track(actor(conn), step_scope([step.id]), fn ->
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
    with {:ok, conn} <- writer(conn),
         {:ok, result, token} <-
           tracked(conn, step_scope(params["ids"]), false, fn _ ->
             Steps.assign(params["ids"], params["assignee_id"])
           end) do
      render_result(conn, Map.put(result, :renumbered, []), token)
    end
    |> ProductionErrors.handle(conn)
  end

  ## Links on a batch's steps (D50 §2.7)

  @doc """
  POST /api/production/steps/:id/links: `{ comes_after_id | leads_to_id,
  answer? }` (one of the two; `answer` `move_all`, the default, or
  `move_only`). The template rules, within the step's batch or split.
  """
  def add_link(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, step} <- fetch_step(id),
         {:ok, result, token} <-
           tracked(conn, step_scope([step.id]), false, fn _ ->
             StepLinks.add(step, Map.take(params, ~w(comes_after_id leads_to_id answer)))
           end) do
      conn
      |> put_status(:created)
      |> render_result(Map.put(result, :renumbered, []), token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/step_links/:id: `{ default_answer }`."
  def update_link(conn, %{"id" => id} = params) do
    link_write(conn, id, &StepLinks.update(&1, Map.take(params, ["default_answer"])))
  end

  @doc "DELETE /api/production/step_links/:id: Remove."
  def remove_link(conn, %{"id" => id}), do: link_write(conn, id, &StepLinks.remove/1)

  defp link_write(conn, id, fun) do
    with {:ok, conn} <- writer(conn),
         %{} = link <- StepLinks.get(id) || {:error, :not_found},
         {:ok, result, token} <-
           tracked(conn, step_scope(StepLinks.step_ids(link)), false, fn _ -> fun.(link) end) do
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
    with {:ok, conn} <- writer(conn),
         {:ok, {cip, token}} <-
           Undo.track(
             actor(conn),
             %{},
             fn -> Cips.create(params, actor(conn)) end,
             &%{steps: [&1.id]}
           ) do
      conn |> put_status(:created) |> render_cip(cip, token)
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "PATCH /api/production/cips/:id: `tank_id`, `notes`, `assignee_id`."
  def update_cip(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, cip} <- fetch_cip(id),
         {:ok, {cip, token}} <-
           Undo.track(actor(conn), %{steps: [cip.id]}, fn -> Cips.update(cip, params) end) do
      render_cip(conn, cip, token)
    end
    |> ProductionErrors.handle(conn)
  end

  def delete_cip(conn, %{"id" => id}) do
    with {:ok, conn} <- writer(conn),
         {:ok, cip} <- fetch_cip(id),
         {:ok, {_, token}} <-
           Undo.track(actor(conn), %{steps: [cip.id]}, fn -> Cips.delete(cip) end) do
      reply(conn, %{data: %{deleted_id: cip.id, batches: []}, undo_token: token})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "POST /api/production/cips/:id/complete: `{ done_on? }`."
  def complete_cip(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, _} <- fetch_cip(id) do
      complete_step(conn, params)
    end
    |> ProductionErrors.handle(conn)
  end

  def uncomplete_cip(conn, %{"id" => id} = params) do
    with {:ok, conn} <- writer(conn),
         {:ok, _} <- fetch_cip(id) do
      uncomplete_step(conn, params)
    end
    |> ProductionErrors.handle(conn)
  end

  ## Flags (§3.9)

  @doc "POST /api/production/flags/signoff: `{ key, signature, note? }` (Mark OK)."
  def sign_off(conn, params) do
    with {:ok, conn} <- writer(conn),
         {:ok, {_, token}} <-
           Undo.track(actor(conn), %{signoffs: [params["key"]]}, fn ->
             Signoffs.sign_off(params, actor(conn))
           end) do
      reply(conn, %{data: %{key: params["key"]}, undo_token: token})
    end
    |> ProductionErrors.handle(conn)
  end

  @doc "DELETE /api/production/flags/signoff/:key: Remove sign-off."
  def remove_signoff(conn, %{"key" => key}) do
    with {:ok, conn} <- writer(conn),
         %{} = signoff <- Signoffs.get_by_key(key) || {:error, :not_found},
         {:ok, {_, token}} <-
           Undo.track(actor(conn), %{signoffs: [key]}, fn -> Signoffs.remove(signoff) end) do
      reply(conn, %{data: %{key: key}, undo_token: token})
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
    with {:ok, conn} <- writer(conn),
         {:ok, %{batch_ids: ids}} <- Undo.undo(actor(conn), token) do
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
    with {:ok, {result, token}} <- Undo.track(actor(conn), scope, fn -> fun.(false) end),
         do: {:ok, result, token}
  end

  defp step_scope(ids), do: Undo.step_scope(ids)

  defp existing_batches(ids),
    do: Repo.all(from(b in RockcutApi.Brewing.Batch, where: b.id in ^ids, select: b.id))

  defp render_result(conn, {:preview, preview}, _token),
    do: reply(conn, %{data: %{preview: preview}})

  defp render_result(conn, %{batch_ids: ids} = result, token),
    do: render_write(conn, ids, Map.delete(result, :batch_ids), token)

  defp render_write(conn, batch_ids, extra, token) do
    batches = batch_ids |> Schedule.batches() |> Enum.map(&production_batch/1)
    reply(conn, %{data: Map.put(extra, :batches, batches), undo_token: token})
  end

  defp render_cip(conn, cip, token) do
    cip =
      Repo.preload(cip, [:step_type, :phase, :assignee, :done_by, :done_on_device], force: true)

    reply(conn, %{
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

  # D50: who a write is for, once per request (an action that hands over to
  # another, such as `complete_cip/2`, doesn't check the code twice): the
  # signed-in person, or on the brewhouse device the person whose staff code
  # came with it (`StaffCodeActing`, the device in `on_device_id`).
  defp writer(%Plug.Conn{assigns: %{actor: _}} = conn), do: {:ok, conn}

  defp writer(conn) do
    with {:ok, actor} <- StaffCodeActing.actor(conn, :production),
         do: {:ok, assign(conn, :actor, actor)}
  end

  defp actor(conn), do: conn.assigns.actor

  # Every answer as the viewer may see it (no emails on a device), and on a
  # device write the person it was recorded as (D40's `recorded_as`).
  defp reply(conn, body) do
    body =
      case conn.assigns[:actor] do
        %{on_device_id: id, name: name} when not is_nil(id) -> Map.put(body, :recorded_as, name)
        _ -> body
      end

    json(conn, for_viewer(body, conn.assigns.current_user))
  end
end
