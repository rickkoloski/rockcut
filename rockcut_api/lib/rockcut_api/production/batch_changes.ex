defmodule RockcutApi.Production.BatchChanges do
  @moduledoc """
  D48 §3.11: changing a scheduled batch. Adding a step or a Set temp ramp,
  changing a ramp, removing a step, adding and removing a transfer / filter,
  and changing a planned batch's template or brand. Splits are
  `Production.Splits`.

  The link logic is the templates' (`StepGraph`, `Ramp`; lead decision 2).
  Batch steps differ from template entries in three ways: they're dated
  (`due_on`), they can be done (a finished step never moves or regenerates),
  and a step added here is marked `added`. The template never changes.

  **Vessels** are the tanks the beer goes through, as in D47: vessel 0 is
  filled by the first Brew day, vessel k > 0 by the Transfer/Filter whose
  `vessel_index` is k. The beer is in vessel k from that transfer's day
  until the next one (`vessel_on/2`).

  Every function runs in one transaction and answers `{:ok, %{batch_ids,
  …}}` or `{:error, reason}`.
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Changeset
  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Batch, Brand}
  alias RockcutApi.Production

  alias RockcutApi.Production.{
    BatchVessel,
    Batches,
    Parts,
    Phase,
    Ramp,
    Step,
    StepGraph,
    StepLink,
    Steps,
    StepType,
    Tank
  }

  @max_name 40
  @edit_fields ~w(detail temperature package_partial notes on_task_list assignee_id)

  ## Adding a step

  @doc """
  Add a step to `batch` (§3.11, P65–P67): `step_type_id`, or `name` for a
  custom ("Something else") step (`:name_required`; up to 40 characters);
  `due_on` (`:due_on_invalid`); `vessel_index` (default: the tank the beer
  is in that day; `:no_such_tank` for one the batch doesn't have);
  `detail`, `temperature` (Set temp, required), `package_partial`, `notes`,
  `on_task_list` (default on), `assignee_id`; and the links
  `comes_after_id` / `leads_to_id` with their `_answer`s (both: it slots in
  between, replacing the direct link).

  Brew day can't be added (`:brew_day`); a Transfer/Filter goes through
  `add_transfer/2` (the same attributes); a Split through `Splits`
  (`:use_split`).
  """
  def add_step(%Batch{} = batch, attrs) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      {type, name} = kind!(attrs)

      case behavior_of(type) do
        "brew" -> Repo.rollback(:brew_day)
        "split" -> Repo.rollback(:use_split)
        "transfer" -> add_transfer!(batch, type, attrs)
        _ -> add_one!(batch, type, name, attrs)
      end
    end)
  end

  defp add_one!(batch, type, name, attrs) do
    due_on = date!(attrs["due_on"])
    steps = steps!(batch)
    not_before_brew!(batch, steps, due_on)
    vessel = vessel!(batch, attrs["vessel_index"], vessel_on(steps, due_on))
    not_after_exit!(batch, steps, vessel, due_on)

    step =
      Repo.insert!(%Step{
        batch_id: batch.id,
        step_type_id: type && type.id,
        name: name,
        phase_id: type && type.starts_phase_id,
        split_method: nil,
        vessel_index: vessel,
        due_on: due_on,
        position: next_position(batch.id, due_on),
        on_task_list: true,
        added: true
      })

    edit!(step, Map.take(attrs, @edit_fields))
    StepGraph.slot_in!(StepGraph.batch(batch.id), step, step, attrs)
    %{batch_ids: [batch.id], step_ids: [step.id]}
  end

  # The type (nil for a custom step) and the custom step's name.
  defp kind!(attrs) do
    case present(attrs["step_type_id"]) do
      nil ->
        name = attrs["name"] |> to_string() |> String.trim()

        cond do
          name == "" -> Repo.rollback(:name_required)
          String.length(name) > @max_name -> Repo.rollback(:name_too_long)
          true -> {nil, name}
        end

      id ->
        case Batches.to_int(id) && Repo.get(StepType, Batches.to_int(id)) do
          %StepType{retired_at: nil} = type -> {type, nil}
          %StepType{} -> Repo.rollback(:retired)
          nil -> Repo.rollback(:not_found)
        end
    end
  end

  # The step dialog's fields, validated as `Steps.update/2` does them
  # (temperature required on Set temp, assignee a Brewery member).
  defp edit!(step, attrs) do
    case Steps.update(step, attrs) do
      {:ok, step} -> step
      {:error, reason} -> Repo.rollback(reason)
    end
  end

  ## Ramps

  @doc """
  Add a Set temp ramp to `batch` (§3.11, P68): `start`, `target`,
  `change_per_day` (as in templates, `Ramp.parse/1`), `first_on` (the first
  step's day), `vessel_index` (default: the tank the beer is in then),
  `phase_id` (default Crash; only the first step starts it),
  `on_task_list`, `assignee_id`, and the links as in `add_step/2`. One step
  a day, chained "move all", marked `added`, sharing a new `ramp_group`.
  """
  def add_ramp(%Batch{} = batch, attrs) do
    attrs = stringify(attrs)

    with {:ok, %{temps: temps}} <- Ramp.parse(attrs) do
      Repo.transaction(fn ->
        type = behavior_type!("set_temp")
        first_on = date!(attrs["first_on"])
        steps = steps!(batch)
        not_before_brew!(batch, steps, first_on)
        vessel = vessel!(batch, attrs["vessel_index"], vessel_on(steps, first_on))
        # D48 DEV QA N6: refused whole when its last step is after the exit.
        not_after_exit!(batch, steps, vessel, Date.add(first_on, length(temps) - 1))

        phase_id =
          if Map.has_key?(attrs, "phase_id"),
            do: phase_id!(attrs["phase_id"]),
            else: Production.default_crash_phase_id()

        on_task_list =
          if Map.has_key?(attrs, "on_task_list"),
            do: truthy?(attrs["on_task_list"]),
            else: type.on_task_list

        steps =
          insert_ramp!(batch, type, temps, %{
            first_on: first_on,
            vessel: vessel,
            phase_id: phase_id,
            on_task_list: on_task_list,
            assignee_id: assignee_id!(attrs["assignee_id"]),
            added: true,
            group: Ramp.new_group()
          })

        StepGraph.slot_in!(StepGraph.batch(batch.id), List.first(steps), List.last(steps), attrs)
        %{batch_ids: [batch.id], step_ids: Enum.map(steps, & &1.id)}
      end)
    end
  end

  @doc """
  Change the ramp `step` is in (§3.11, P69; lead decision 3): a new
  `target` and/or `change_per_day`. Only its **unfinished** steps are
  regenerated, from the last finished temperature (or the ramp's start) to
  the target; the first new step takes the first unfinished one's day,
  tank, phase and settings, and the links into and out of the unfinished
  steps are kept. `:not_ramp` for a step outside a ramp, `:step_done` when
  every step of it is done, and `Ramp`'s errors for the values.
  """
  def change_ramp(%Step{} = step, attrs) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      if is_nil(step.batch_id) or is_nil(step.ramp_group), do: Repo.rollback(:not_ramp)

      group =
        Repo.all(
          from(s in Step,
            where: s.batch_id == ^step.batch_id and s.ramp_group == ^step.ramp_group
          )
        )
        |> Enum.sort_by(&Parts.order/1)

      {done, open} = Enum.split_with(group, & &1.done_on)
      if open == [], do: Repo.rollback(:step_done)

      start = (List.last(done) || hd(group)).temperature
      current = List.last(group).temperature
      target = ramp_value!(Ramp.temperature(present(attrs["target"]) || current))

      gap = abs(start - target)
      # Kept by default, but never more than the new gap.
      change =
        ramp_value!(
          Ramp.change(present(attrs["change_per_day"]) || current_change(group, gap), gap)
        )

      temps = ramp_value!(Ramp.temperatures(start, target, change))
      temps = if done == [], do: temps, else: tl(temps)
      first = hd(open)
      open_ids = MapSet.new(open, & &1.id)

      links =
        Repo.all(
          from(l in StepLink,
            where:
              l.from_step_id in ^MapSet.to_list(open_ids) or
                l.to_step_id in ^MapSet.to_list(open_ids)
          )
        )

      into = Enum.reject(links, &MapSet.member?(open_ids, &1.from_step_id))
      out = Enum.reject(links, &MapSet.member?(open_ids, &1.to_step_id))
      Repo.delete_all(from(s in Step, where: s.id in ^MapSet.to_list(open_ids)))

      steps =
        insert_ramp!(%Batch{id: step.batch_id}, behavior_type!("set_temp"), temps, %{
          first_on: first.due_on,
          vessel: first.vessel_index,
          phase_id: first.phase_id,
          on_task_list: first.on_task_list,
          assignee_id: first.assignee_id,
          added: first.added,
          group: step.ramp_group
        })

      for l <- into, do: put_link!(l.from_step_id, hd(steps).id, l.default_answer)
      for l <- out, do: put_link!(List.last(steps).id, l.to_step_id, l.default_answer)

      %{batch_ids: [step.batch_id], step_ids: Enum.map(steps, & &1.id)}
    end)
  end

  defp current_change([a, b | _], gap)
       when is_integer(a.temperature) and is_integer(b.temperature),
       do: a.temperature |> Kernel.-(b.temperature) |> abs() |> max(1) |> min(max(gap, 1))

  defp current_change(_, gap), do: max(gap, 1)

  defp ramp_value!({:ok, v}), do: v
  defp ramp_value!({:error, reason}), do: Repo.rollback(reason)

  defp insert_ramp!(batch, type, temps, o) do
    steps =
      temps
      |> Enum.with_index()
      |> Enum.map(fn {temp, i} ->
        day = Date.add(o.first_on, i)

        Repo.insert!(%Step{
          batch_id: batch.id,
          step_type_id: type.id,
          phase_id: if(i == 0, do: o.phase_id),
          vessel_index: o.vessel,
          temperature: temp,
          on_task_list: o.on_task_list,
          assignee_id: o.assignee_id,
          due_on: day,
          position: next_position(batch.id, day),
          added: o.added,
          ramp_group: o.group
        })
      end)

    steps
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.each(fn [a, b] -> put_link!(a.id, b.id, "move_all") end)

    steps
  end

  ## Removing a step

  @doc """
  Remove an unfinished step (§3.11, P70–P71): its links pass through to
  the steps after it. Not Brew day (`:brew_day`), a Split (`:split_fill`:
  it fills the parts; Undo split instead) or a done step (`:step_done`). A Transfer/Filter is `remove_transfer` (the beer stays in
  the tank before it).
  """
  def remove_step(%Step{} = step) do
    Repo.transaction(fn ->
      step = Repo.preload(step, :step_type)
      if is_nil(step.batch_id), do: Repo.rollback(:not_found)
      if step.done_on, do: Repo.rollback(:step_done)

      case Steps.behavior(step) do
        "brew" ->
          Repo.rollback(:brew_day)

        # D48: the Split fills the parts; Undo split takes it out.
        "split" ->
          Repo.rollback(:split_fill)

        "transfer" ->
          remove_transfer!(step)
          # D48 DEV QA N1: the tanks either side of it now meet.
          no_tank_twice!(%Batch{id: step.batch_id}, [step.vessel_index])

        _ ->
          StepGraph.pass_through!(StepGraph.batch(step.batch_id), step)
      end

      %{batch_ids: [step.batch_id]}
    end)
  end

  ## Transfers

  @doc """
  Add a transfer or filter to `batch` on `due_on` (§3.11, P72–P73; lead
  decision 4): `step_type_id` (Transfer or Filter; default Transfer),
  `tank_id` (nil = Unassigned), `notes`, `assignee_id`. The beer is in
  vessel k that day: its unfinished steps dated on or after it move to a new
  vessel k + 1 in that tank, and the later vessels move up one. The tank
  left behind gets a CIP & Sanitize that day, linked "move all" from the
  transfer. Refused (`:step_done_after`) when a step of vessel k or later
  dated after that day is done. The day must fall while the beer is in that
  tank (`in_tank!/4`), and the tank must be another one, nor the one the
  beer goes into next (`no_tank_twice!/3`; D48 DEV QA M1, M3, N1). `moved`
  doesn't count the CIP at the old exit, which goes on with it.
  """
  def add_transfer(%Batch{} = batch, attrs) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      type =
        case present(attrs["step_type_id"]) do
          nil -> behavior_type!("transfer")
          _ -> elem(kind!(attrs), 0)
        end

      if behavior_of(type) != "transfer", do: Repo.rollback(:not_found)
      add_transfer!(batch, type, attrs)
    end)
  end

  defp add_transfer!(batch, type, attrs) do
    day = date!(attrs["due_on"])
    tank_id = Batches.active_tank_id!(attrs["tank_id"])
    steps = steps!(batch)
    k = vessel_on(steps, day)
    fill = fill_of(steps, k)
    in_tank!(batch, steps, k, day)

    if Enum.any?(
         steps,
         &(&1.vessel_index >= k and &1.done_on != nil and after?(&1.due_on, day) and &1 != fill)
       ),
       do: Repo.rollback(:step_done_after)

    moving =
      Enum.filter(
        steps,
        &(&1.vessel_index == k and &1 != fill and is_nil(&1.done_on) and
            not after?(day, &1.due_on))
      )

    shift_vessels!(batch, k, +1)
    Repo.insert!(%BatchVessel{batch_id: batch.id, vessel_index: k + 1, tank_id: tank_id})
    # D48 QA M3, DEV QA N1: not the tank the beer is in, nor the one it goes into next.
    no_tank_twice!(batch, [k + 1, k + 2], k + 1)

    ids = Enum.map(moving, & &1.id)
    Repo.update_all(from(s in Step, where: s.id in ^ids), set: [vessel_index: k + 1])

    transfer =
      Repo.insert!(%Step{
        batch_id: batch.id,
        step_type_id: type.id,
        phase_id: type.starts_phase_id,
        vessel_index: k + 1,
        due_on: day,
        position: next_position(batch.id, day),
        on_task_list: type.on_task_list,
        added: true
      })

    transfer = edit!(transfer, Map.take(attrs, ~w(notes assignee_id)))
    cip_type = behavior_type!("cip")

    cip =
      Repo.insert!(%Step{
        batch_id: batch.id,
        step_type_id: cip_type.id,
        vessel_index: k,
        due_on: day,
        position: next_position(batch.id, day),
        on_task_list: cip_type.on_task_list,
        added: true
      })

    graph = StepGraph.batch(batch.id)
    StepGraph.insert_link!(graph, transfer, cip, "move_all")

    # In the chain: after the last step left in the tank, before the first
    # one that moved.
    stays =
      Enum.filter(
        steps,
        &(&1.vessel_index == k and &1.id not in ids and not after?(&1.due_on, day))
      )

    prev = Enum.max_by(stays, &Parts.order/1, fn -> nil end)
    next = Enum.min_by(moving, &Parts.order/1, fn -> nil end)

    StepGraph.slot_in!(graph, transfer, transfer, %{
      "comes_after_id" => prev && prev.id,
      "leads_to_id" => next && next.id
    })

    # The CIP for the old exit goes on with it to the new tank; it isn't a
    # step that moves (D48 DEV QA N1).
    {_, exit} = stay(batch, steps, k)
    exit_cips = Enum.count(moving, &(Steps.behavior(&1) == "cip" and &1.due_on == exit))

    %{
      batch_ids: [batch.id],
      step_ids: [transfer.id, cip.id],
      moved: length(moving) - exit_cips
    }
  end

  # Removing an unfinished transfer into vessel j (P74): its steps go back
  # to vessel j − 1, the later vessels move down one, and the CIP it set up
  # (that day, the tank it left, linked from it) goes.
  defp remove_transfer!(%Step{} = transfer) do
    batch_id = transfer.batch_id
    j = transfer.vessel_index
    graph = StepGraph.batch(batch_id)

    set_up =
      Repo.all(
        from(s in Step,
          join: l in StepLink,
          on: l.to_step_id == s.id and l.from_step_id == ^transfer.id,
          join: t in StepType,
          on: t.id == s.step_type_id,
          where:
            s.batch_id == ^batch_id and t.behavior == "cip" and s.vessel_index == ^(j - 1) and
              s.due_on == ^transfer.due_on and is_nil(s.done_on)
        )
      )

    for cip <- set_up, do: StepGraph.pass_through!(graph, cip)
    StepGraph.pass_through!(graph, Repo.get!(Step, transfer.id))

    Repo.update_all(from(s in Step, where: s.batch_id == ^batch_id and s.vessel_index == ^j),
      set: [vessel_index: j - 1]
    )

    Repo.delete_all(
      from(v in BatchVessel, where: v.batch_id == ^batch_id and v.vessel_index == ^j)
    )

    shift_vessels!(%Batch{id: batch_id}, j, -1)
  end

  # Vessels (and their steps) after vessel `k` move by `by` (±1). Rows move
  # one at a time, away from each other, so the (batch, vessel) index holds.
  defp shift_vessels!(batch, k, by) do
    vessels =
      Repo.all(from(v in BatchVessel, where: v.batch_id == ^batch.id and v.vessel_index > ^k))
      |> Enum.sort_by(& &1.vessel_index, if(by > 0, do: :desc, else: :asc))

    for v <- vessels,
        do: v |> Changeset.change(vessel_index: v.vessel_index + by) |> Repo.update!()

    Repo.update_all(from(s in Step, where: s.batch_id == ^batch.id and s.vessel_index > ^k),
      inc: [vessel_index: by]
    )
  end

  ## Template and brand

  @doc """
  Change a planned batch's template (§3.11, P83; lead decision 6): every
  step that wasn't added is rebuilt from the new template from the same
  brew day (two-day brews kept). Added transfers are dropped first; other
  added steps keep their dates, go in the tank the beer is in then, and
  follow the last new step before them. Vessels that still exist keep their
  tanks; a new one starts Unassigned. `:not_planned` once brewed, `:split`
  for a split batch or a part. `{:ok, %{batch_ids, message, renumbered}}`.
  """
  def change_template(%Batch{} = batch, template_id) do
    Repo.transaction(fn ->
      batch = Repo.preload(batch, :template, force: true)
      if batch.status != "planned", do: Repo.rollback(:not_planned)
      if split?(batch), do: Repo.rollback(:split)
      template = Batches.plannable_template!(Batches.to_int(template_id))

      {{kept, dropped}, renumbered} =
        Batches.with_renumbering(fn ->
          # Added transfers go first; the message names where they went (QA minor 7a).
          added = Enum.filter(steps!(batch), &(&1.added and Steps.behavior(&1) == "transfer"))
          dropped = Enum.map(added, &vessel_tank_name(batch, &1.vessel_index))

          for t <- Enum.sort_by(added, & &1.vessel_index, :desc),
              do: remove_transfer!(Repo.get!(Step, t.id))

          steps = steps!(batch)
          brew_on = Parts.first_brew(steps).due_on
          {kept, rebuilt} = Enum.split_with(steps, & &1.added)
          Repo.delete_all(from(s in Step, where: s.id in ^Enum.map(rebuilt, & &1.id)))

          last = template.steps |> Enum.map(& &1.vessel_index) |> Enum.max(fn -> 0 end)

          Repo.delete_all(
            from(v in BatchVessel, where: v.batch_id == ^batch.id and v.vessel_index > ^last)
          )

          have =
            Repo.all(
              from(v in BatchVessel, where: v.batch_id == ^batch.id, select: v.vessel_index)
            )

          for k <- 0..last,
              k not in have,
              do: Repo.insert!(%BatchVessel{batch_id: batch.id, vessel_index: k})

          Batches.copy_steps!(batch, template, brew_on, batch.brew_two_days)
          batch |> Changeset.change(template_id: template.id) |> Repo.update!()
          reanchor!(batch, kept)
          no_tank_twice!(batch, :all)
          {kept, dropped}
        end)

      n = Enum.count(kept, &(not Step.marker?(&1)))
      from_name = (batch.template && batch.template.name) || "No template"

      %{
        batch_ids: [batch.id],
        renumbered: renumbered,
        message: "#{from_name} → #{template.name}." <> kept_dropped(n, dropped)
      }
    end)
  end

  # " Kept 1 added step; dropped the added transfer into Q1D."
  defp kept_dropped(0, []), do: ""

  defp kept_dropped(n, dropped) do
    kept = if n > 0, do: "kept #{n} added step#{if n == 1, do: "", else: "s"}"

    gone =
      case dropped do
        [] -> nil
        [nil] -> "dropped the added transfer"
        [one] -> "dropped the added transfer into #{one}"
        many -> "dropped #{length(many)} added transfers"
      end

    text = [kept, gone] |> Enum.reject(&is_nil/1) |> Enum.join("; ")
    " " <> String.capitalize(String.first(text)) <> String.slice(text, 1..-1//1) <> "."
  end

  defp vessel_tank_name(batch, k) do
    case Repo.get_by(BatchVessel, batch_id: batch.id, vessel_index: k) do
      %BatchVessel{tank_id: id} when not is_nil(id) -> Repo.get!(Tank, id).name
      _ -> nil
    end
  end

  # Added steps kept through a template change: in the tank the beer is in
  # on their day, and each kept chain's first step after the last rebuilt
  # step there (QA minor 7b: kept ramps too; nothing kept is left unlinked).
  # A ramp keeps its own chain.
  defp reanchor!(batch, kept) do
    steps = steps!(batch)
    kept_ids = MapSet.new(kept, & &1.id)
    rebuilt = Enum.reject(steps, &MapSet.member?(kept_ids, &1.id))
    graph = StepGraph.batch(batch.id)

    for s <- Enum.filter(steps, &MapSet.member?(kept_ids, &1.id)) do
      k = vessel_on(rebuilt, s.due_on)
      s = s |> Changeset.change(vessel_index: k) |> Repo.update!()
      led = Repo.exists?(from(l in StepLink, where: l.to_step_id == ^s.id))

      in_tank = Enum.filter(rebuilt, &(&1.vessel_index == k))

      prev =
        in_tank
        |> Enum.filter(&(not after?(&1.due_on, s.due_on)))
        |> Enum.max_by(&Parts.order/1, fn -> nil end)

      cond do
        led ->
          :ok

        prev ->
          StepGraph.insert_link!(graph, prev, s, "move_all")

        # Dated before everything rebuilt there (a step checked off early):
        # still linked, from the tank's first step; "Steps out of order"
        # flags it (QA minor 7b: nothing kept is left unlinked).
        first = Enum.min_by(in_tank, &Parts.order/1, fn -> nil end) ->
          put_link!(first.id, s.id, "move_all")

        true ->
          :ok
      end
    end
  end

  @doc """
  Change a planned batch's brand (§3.11, P84); its parts follow.
  `:not_planned` once brewed, `:brand_invalid` for a retired or unknown brand.
  """
  def change_brand(%Batch{} = batch, brand_id) do
    Repo.transaction(fn ->
      if batch.split_parent_id, do: Repo.rollback(:split_part)
      if batch.status != "planned", do: Repo.rollback(:not_planned)

      brand =
        case Batches.to_int(brand_id) && Repo.get(Brand, Batches.to_int(brand_id)) do
          %Brand{status: status} = b when status != "retired" -> b
          _ -> Repo.rollback(:brand_invalid)
        end

      batch |> Changeset.change(brand_id: brand.id) |> Repo.update!()

      Repo.update_all(from(b in Batch, where: b.split_parent_id == ^batch.id),
        set: [brand_id: brand.id]
      )

      %{batch_ids: [batch.id]}
    end)
  end

  ## Helpers

  @doc """
  The vessel the beer is in on `day`: the highest one whose Transfer/Filter
  is dated on or before it (0 when none is). `steps` need `step_type`.
  """
  def vessel_on(steps, day) do
    steps
    |> Enum.filter(&(Steps.behavior(&1) == "transfer" and not after?(&1.due_on, day)))
    |> Enum.map(& &1.vessel_index)
    |> Enum.max(fn -> 0 end)
  end

  ## When the beer is there (D48 DEV QA M1)

  @doc """
  The days the beer is in vessel `k`: `{fill, exit}`, the day it comes in
  (the first Brew day, the Transfer/Filter into it, or for a split part's
  first tank its parent's Split) and the day it leaves (a full Package or a
  Split in it, or the next Transfer/Filter), either nil when there's none.
  """
  def stay(%Batch{} = batch, steps, k) do
    fill =
      case fill_of(steps, k) do
        nil when k == 0 -> parent_split(batch)
        step -> step
      end

    exit =
      steps
      |> Enum.filter(fn s ->
        case Steps.behavior(s) do
          "package" -> s.vessel_index == k and not s.package_partial
          "split" -> s.vessel_index == k
          "transfer" -> s.vessel_index == k + 1
          _ -> false
        end
      end)
      |> Enum.min_by(&Parts.order/1, fn -> nil end)

    {fill && fill.due_on, exit && exit.due_on}
  end

  @doc "A transfer, filter or split on `day` in vessel `k`: after its fill (`:before_fill`) and before its exit (`:after_exit`)."
  def in_tank!(batch, steps, k, day) do
    {fill, exit} = stay(batch, steps, k)
    if fill && not after?(day, fill), do: Repo.rollback(:before_fill)
    if exit && not after?(exit, day), do: Repo.rollback(:after_exit)
    :ok
  end

  # Added steps and ramps start on brew day or later (a split part: its
  # Split, `:before_split`; D48 DEV QA N4).
  defp not_before_brew!(batch, steps, day) do
    case Parts.first_brew(steps) do
      nil ->
        split = parent_split(batch)
        if split && after?(split.due_on, day), do: Repo.rollback(:before_split)

      brew ->
        if after?(brew.due_on, day), do: Repo.rollback(:before_brew_day)
    end

    :ok
  end

  # ... and on or before the exit of the tank they're in (D48 DEV QA N6).
  defp not_after_exit!(batch, steps, k, day) do
    {_, exit} = stay(batch, steps, k)
    if exit && after?(day, exit), do: Repo.rollback(:after_exit)
    :ok
  end

  @doc """
  No two vessels in a row in one tank (D48 DEV QA N1; Unassigned never
  matches): vessel `j` against `j - 1`, for each `j` in `indexes` (or
  `:all`). `{:same_tank, name}` when `j` is the vessel the change just put
  a tank in (`new`), else `{:same_tank, name, day}`, the day the beer goes
  into `j`.
  """
  def no_tank_twice!(%Batch{id: id} = batch, indexes, new \\ nil) do
    tanks =
      Repo.all(
        from(v in BatchVessel, where: v.batch_id == ^id, select: {v.vessel_index, v.tank_id})
      )
      |> Map.new()

    js = if indexes == :all, do: Enum.sort(Map.keys(tanks)), else: indexes

    case Enum.find(js, &(tanks[&1] != nil and tanks[&1] == tanks[&1 - 1])) do
      nil ->
        :ok

      ^new ->
        Repo.rollback({:same_tank, Repo.get!(Tank, tanks[new]).name})

      j ->
        fill = fill_of(steps!(batch), j)
        Repo.rollback({:same_tank, Repo.get!(Tank, tanks[j]).name, fill && fill.due_on})
    end
  end

  defp parent_split(%Batch{split_parent_id: nil}), do: nil

  defp parent_split(%Batch{split_parent_id: id}) do
    Repo.one(
      from(s in Step,
        join: t in StepType,
        on: t.id == s.step_type_id,
        where: s.batch_id == ^id and t.behavior == "split",
        order_by: [s.due_on, s.id],
        limit: 1
      )
    )
  end

  @doc "What fills vessel k: the first Brew day for 0, else its Transfer/Filter (nil for a part's 0)."
  def fill_of(steps, 0), do: Parts.first_brew(steps)

  def fill_of(steps, k),
    do:
      steps
      |> Enum.filter(&(Steps.behavior(&1) == "transfer" and &1.vessel_index == k))
      |> Enum.min_by(&Parts.order/1, fn -> nil end)

  defp split?(%Batch{split_parent_id: id}) when not is_nil(id), do: true

  defp split?(%Batch{id: id}),
    do: Repo.exists?(from(b in Batch, where: b.split_parent_id == ^id))

  defp steps!(%Batch{id: id}) do
    Repo.all(from(s in Step, where: s.batch_id == ^id, preload: :step_type))
    |> Enum.sort_by(&Parts.order/1)
  end

  defp vessel!(batch, nil, default), do: vessel!(batch, default, default)
  defp vessel!(batch, "", default), do: vessel!(batch, default, default)

  defp vessel!(batch, value, _default) do
    k = Batches.to_int(value)

    if is_integer(k) and
         Repo.exists?(
           from(v in BatchVessel, where: v.batch_id == ^batch.id and v.vessel_index == ^k)
         ),
       do: k,
       else: Repo.rollback(:no_such_tank)
  end

  defp date!(value) do
    case value && Date.from_iso8601(to_string(value)) do
      {:ok, d} -> d
      _ -> Repo.rollback(:due_on_invalid)
    end
  end

  defp phase_id!(value) do
    case present(value) do
      nil ->
        nil

      id ->
        case Batches.to_int(id) && Repo.get(Phase, Batches.to_int(id)) do
          %Phase{retired_at: nil, id: id} -> id
          _ -> Repo.rollback(:not_found)
        end
    end
  end

  defp assignee_id!(value) do
    case present(value) do
      nil ->
        nil

      id ->
        if RockcutApi.Authz.can_take_task?(RockcutApi.Accounts.get_user(id), "brewery"),
          do: Batches.to_int(id),
          else: Repo.rollback(:assignee_invalid)
    end
  end

  defp next_position(batch_id, day) do
    (Repo.one(
       from(s in Step,
         where: s.batch_id == ^batch_id and s.due_on == ^day,
         select: max(s.position)
       )
     ) || 0) + 1
  end

  # A link the change keeps (no checks: it was there before), once.
  defp put_link!(from_id, to_id, answer) do
    unless from_id == to_id or
             Repo.exists?(
               from(l in StepLink, where: l.from_step_id == ^from_id and l.to_step_id == ^to_id)
             ) do
      Repo.insert!(%StepLink{from_step_id: from_id, to_step_id: to_id, default_answer: answer})
    end
  end

  defp behavior_type!(behavior) do
    Repo.one!(from(t in StepType, where: t.behavior == ^behavior, order_by: t.id, limit: 1))
  end

  defp behavior_of(nil), do: nil
  defp behavior_of(%StepType{behavior: b}), do: b

  defp after?(a, b), do: Date.compare(a, b) == :gt
  defp truthy?(v), do: v in [true, "true", 1, "1"]
  defp present(v) when v in [nil, ""], do: nil
  defp present(v), do: v
  defp stringify(attrs), do: Map.new(attrs, fn {k, v} -> {to_string(k), v} end)
end
