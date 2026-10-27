defmodule RockcutApi.Production.Splits do
  @moduledoc """
  D48 §3.11: splitting a batch into parts, and Undo split (lead decision 5).

  **The parts** are batches of their own (`split_parent_id`, `part_number`
  1…n) with the parent's brand, template and two-day setting and their own
  volume. They have no batch number: their label is the parent's number or
  P-number and `.n` (`Batches.number_label/2`). Each part's vessel 0 is the
  tank it fills on the split day, filled by the parent's Split step
  (`Schedule` gives it as the part's `origin`).

  **The parent** gets a Split step that day in the tank the beer is in
  (`split_method` `transfer` or `filter`), which ends its stay there. It
  keeps every step before; its unfinished steps from that day on, in that
  tank and the later ones, become each part's own copy (links between them
  copied) and leave the parent.

  **Tanks:** one part may stay in the parent's tank ("(stays here)";
  `:one_stays`); the others each fill their own (`:same_tank`). The part
  that stays (else part 1) keeps the parent's later tanks; the other parts'
  later tanks start Unassigned. When no part stays, the tank left behind
  gets a CIP & Sanitize that day, linked from the Split.

  Checking the Split off completes the parent and the parts become
  `fermenting` (`Steps.complete/4`).
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.Batch

  alias RockcutApi.Production.{
    BatchChanges,
    Batches,
    BatchVessel,
    Parts,
    Step,
    StepGraph,
    StepLink,
    Steps,
    StepType
  }

  @methods ~w(transfer filter)
  @copied ~w(step_type_id name phase_id detail temperature split_method cip_method package_partial notes
             on_task_list position due_on assignee_id added template_step_id ramp_group)a

  @doc """
  Split `batch` (§3.11, P75–P78, P82, P110): `due_on`, `split_method`
  (`transfer` / `filter`, default `transfer`), and `parts`: two or more
  `%{tank_id, stays, volume_bbl}` (a list, or a map by index), whose
  volumes add up to the batch's (`{:volumes_must_add_up, total, label}`).
  `{:ok, %{batch_ids, part_ids}}`.
  """
  def split(%Batch{} = batch, attrs) do
    attrs = stringify(attrs)

    Repo.transaction(fn ->
      if batch.split_parent_id, do: Repo.rollback(:split_part)
      if parts_of(batch) != [], do: Repo.rollback(:split)

      method = attrs["split_method"] || "transfer"
      if method not in @methods, do: Repo.rollback(:split_method_invalid)

      steps = steps!(batch)
      day = date!(attrs["due_on"])
      brew = Parts.first_brew(steps)
      # D48 DEV QA M1, minor 12: after brew day, and while the beer is in the tank.
      if brew && Date.compare(day, brew.due_on) != :gt, do: Repo.rollback(:split_before_brew)

      k = BatchChanges.vessel_on(steps, day)
      BatchChanges.in_tank!(batch, steps, k, day)
      vessels = Repo.all(from(v in BatchVessel, where: v.batch_id == ^batch.id))
      here = Enum.find_value(vessels, &(&1.vessel_index == k && &1.tank_id))
      parts = parts!(attrs["parts"], here)
      check_volumes!(batch, parts)
      fill = BatchChanges.fill_of(steps, k)

      if Enum.any?(
           steps,
           &(&1.vessel_index >= k and &1.done_on != nil and after?(&1.due_on, day) and &1 != fill)
         ),
         do: Repo.rollback(:step_done_after)

      moving =
        Enum.filter(
          steps,
          &(&1.vessel_index >= k and &1 != fill and is_nil(&1.done_on) and
              not after?(day, &1.due_on))
        )

      moving_ids = Enum.map(moving, & &1.id)

      links =
        Repo.all(
          from(l in StepLink,
            where: l.from_step_id in ^moving_ids and l.to_step_id in ^moving_ids
          )
        )

      # The parent's links into and out of the steps that move: Undo split
      # puts them back (D48 DEV QA X3).
      edge =
        Repo.all(
          from(l in StepLink,
            where:
              (l.from_step_id in ^moving_ids and l.to_step_id not in ^moving_ids) or
                (l.to_step_id in ^moving_ids and l.from_step_id not in ^moving_ids)
          )
        )

      split_step = insert_split!(batch, k, day, method, steps, moving_ids)
      keeper = Enum.find_index(parts, & &1.stays) || 0
      last = vessels |> Enum.map(& &1.vessel_index) |> Enum.max()

      part_ids =
        for {p, i} <- Enum.with_index(parts, 1) do
          part =
            Repo.insert!(%Batch{
              brand_id: batch.brand_id,
              template_id: batch.template_id,
              brew_two_days: batch.brew_two_days,
              status: "planned",
              volume_bbl: p.volume,
              notes: batch.notes,
              split_parent_id: batch.id,
              part_number: i,
              split_stays: p.stays,
              pencilled: batch.pencilled
            })

          for j <- 0..(last - k) do
            tank =
              cond do
                j == 0 ->
                  p.tank_id

                i - 1 == keeper ->
                  Enum.find_value(vessels, &(&1.vessel_index == k + j && &1.tank_id))

                true ->
                  nil
              end

            Repo.insert!(%BatchVessel{batch_id: part.id, vessel_index: j, tank_id: tank})
          end

          copied = copy_steps!(moving, links, part.id, -k)
          # D48 DEV QA N1: a part doesn't fill the tank its copied steps go
          # into next; each part is checked on its own and named (R3).
          case BatchChanges.tank_twice(part, :all) do
            :ok -> :ok
            reason -> Repo.rollback({:part, i, reason})
          end

          {part.id, copied}
        end

      # The edge links, with the moved ends as the keeper's copies.
      kept = part_ids |> Enum.at(keeper) |> elem(1)
      to_kept = &Map.get(kept, &1, &1)

      batch
      |> Ecto.Changeset.change(
        split_links: %{
          "links" =>
            Enum.map(
              edge,
              &[to_kept.(&1.from_step_id), to_kept.(&1.to_step_id), &1.default_answer]
            )
        }
      )
      |> Repo.update!()

      part_ids = Enum.map(part_ids, &elem(&1, 0))

      Repo.delete_all(from(s in Step, where: s.id in ^moving_ids))

      Repo.delete_all(
        from(v in BatchVessel, where: v.batch_id == ^batch.id and v.vessel_index > ^k)
      )

      unless Enum.any?(parts, & &1.stays) do
        cip_type = behavior_type!("cip")

        cip =
          Repo.insert!(%Step{
            batch_id: batch.id,
            step_type_id: cip_type.id,
            vessel_index: k,
            due_on: day,
            position: split_step.position + 1,
            on_task_list: cip_type.on_task_list,
            added: true
          })

        put_link!(split_step.id, cip.id, "move_all")
      end

      # D48 DEV QA fix cycle 4: the whole tree, as every later change checks it.
      BatchChanges.no_tree_twice!(batch)
      %{batch_ids: [batch.id | part_ids], part_ids: part_ids}
    end)
  end

  @doc """
  Undo split (§3.11, P80–P81): the steps of the part that stays (else part
  1's, the part that kept the later tanks; D48 DEV QA X3) go back to the
  parent (in the parent's tank, its later tanks with them), with the
  parent's links into and out of them as they were before the split; the
  other parts are deleted, and the Split (with the CIP it set up) is
  removed. `batch` may be the parent or a part. `:not_split`;
  `:part_step_done` once a part has a finished step; `:step_done` once the
  Split is done.
  """
  def undo_split(%Batch{} = batch) do
    Repo.transaction(fn ->
      parent = if batch.split_parent_id, do: Repo.get!(Batch, batch.split_parent_id), else: batch
      parts = parts_of(parent)
      if parts == [], do: Repo.rollback(:not_split)
      part_ids = Enum.map(parts, & &1.id)

      if Repo.exists?(from(s in Step, where: s.batch_id in ^part_ids and not is_nil(s.done_on))),
        do: Repo.rollback(:part_step_done)

      split_step =
        steps!(parent)
        |> Enum.filter(&(Steps.behavior(&1) == "split"))
        |> Enum.min_by(&Parts.order/1, fn -> Repo.rollback(:not_split) end)

      if split_step.done_on, do: Repo.rollback(:step_done)
      k = split_step.vessel_index
      first = Enum.find(parts, hd(parts), & &1.split_stays)
      graph = StepGraph.batch(parent.id)

      for cip <- set_up_cips(split_step), do: StepGraph.pass_through!(graph, cip)
      into = Repo.all(from(l in StepLink, where: l.to_step_id == ^split_step.id))
      Repo.delete!(Repo.get!(Step, split_step.id))

      back = steps!(first)
      ids = Enum.map(back, & &1.id)

      links =
        Repo.all(from(l in StepLink, where: l.from_step_id in ^ids and l.to_step_id in ^ids))

      new_ids = copy_steps!(back, links, parent.id, k)

      for v <-
            Repo.all(
              from(v in BatchVessel, where: v.batch_id == ^first.id and v.vessel_index > 0)
            ),
          do:
            Repo.insert!(%BatchVessel{
              batch_id: parent.id,
              vessel_index: k + v.vessel_index,
              tank_id: v.tank_id
            })

      case {parent.split_links, Enum.min_by(back, &Parts.order/1, fn -> nil end)} do
        {_, nil} ->
          :ok

        # Split before the links were kept: the steps follow what led into the Split.
        {nil, s} ->
          for l <- into, do: put_link!(l.from_step_id, new_ids[s.id], l.default_answer)

        {%{"links" => edge}, _} ->
          here =
            MapSet.new(Repo.all(from(s in Step, where: s.batch_id == ^parent.id, select: s.id)))

          id = &(new_ids[&1] || (MapSet.member?(here, &1) && &1))

          for [from_id, to_id, answer] <- edge,
              a = id.(from_id),
              b = id.(to_id),
              do: put_link!(a, b, answer)
      end

      Repo.delete_all(from(b in Batch, where: b.id in ^part_ids))
      parent |> Ecto.Changeset.change(split_links: nil) |> Repo.update!()
      BatchChanges.no_tank_twice!(parent, [k + 1])
      %{batch_ids: [parent.id]}
    end)
  end

  @doc "A batch's parts, by number."
  def parts_of(%Batch{id: id}),
    do: Repo.all(from(b in Batch, where: b.split_parent_id == ^id, order_by: b.part_number))

  ## Helpers

  defp insert_split!(batch, k, day, method, steps, moving_ids) do
    type = behavior_type!("split")

    split =
      Repo.insert!(%Step{
        batch_id: batch.id,
        step_type_id: type.id,
        phase_id: type.starts_phase_id,
        vessel_index: k,
        split_method: method,
        due_on: day,
        position: next_position(batch.id, day),
        on_task_list: type.on_task_list,
        added: true
      })

    # In the chain after the last step that stays in the tank.
    prev =
      steps
      |> Enum.filter(
        &(&1.vessel_index == k and &1.id not in moving_ids and not after?(&1.due_on, day))
      )
      |> Enum.max_by(&Parts.order/1, fn -> nil end)

    if prev, do: put_link!(prev.id, split.id, "move_all")
    split
  end

  # Copies `steps` (and the `links` between them) into `batch_id`, their
  # vessels moved by `shift`. `%{old id => new id}`.
  defp copy_steps!(steps, links, batch_id, shift) do
    ids =
      Map.new(steps, fn s ->
        fields = Map.take(s, @copied)

        new =
          Repo.insert!(
            struct(
              Step,
              Map.merge(fields, %{batch_id: batch_id, vessel_index: s.vessel_index + shift})
            )
          )

        {s.id, new.id}
      end)

    for l <- links, do: put_link!(ids[l.from_step_id], ids[l.to_step_id], l.default_answer)
    ids
  end

  # The CIP & Sanitize the Split set up: that day, its tank, linked from it.
  defp set_up_cips(split) do
    Repo.all(
      from(s in Step,
        join: l in StepLink,
        on: l.to_step_id == s.id and l.from_step_id == ^split.id,
        join: t in StepType,
        on: t.id == s.step_type_id,
        where:
          t.behavior == "cip" and s.vessel_index == ^split.vessel_index and
            s.due_on == ^split.due_on and is_nil(s.done_on)
      )
    )
  end

  # The parts asked for: at least two, at most one staying ("(stays here)";
  # picking the tank the beer is in is refused), no two in one tank.
  defp parts!(raw, here) do
    list =
      cond do
        is_list(raw) ->
          raw

        is_map(raw) ->
          raw |> Enum.sort_by(fn {k, _} -> Batches.to_int(k) || 0 end) |> Enum.map(&elem(&1, 1))

        true ->
          []
      end

    if length(list) < 2, do: Repo.rollback(:parts_required)

    parts =
      Enum.map(list, fn p ->
        p = stringify(p)
        tank = if truthy?(p["stays"]), do: here, else: Batches.active_tank_id!(p["tank_id"])

        # "(stays here)" is the only way to stay (D48 DEV QA M3).
        if here && tank == here && not truthy?(p["stays"]),
          do: Repo.rollback({:same_tank, Repo.get!(RockcutApi.Production.Tank, here).name})

        volume =
          case Decimal.cast(p["volume_bbl"]) do
            {:ok, v} -> if Decimal.gt?(v, 0), do: v, else: Repo.rollback(:volume_invalid)
            :error -> Repo.rollback(:volume_invalid)
          end

        %{
          tank_id: tank,
          stays: truthy?(p["stays"]),
          volume: volume
        }
      end)

    if Enum.count(parts, & &1.stays) > 1, do: Repo.rollback(:one_stays)
    tanks = parts |> Enum.map(& &1.tank_id) |> Enum.reject(&is_nil/1)
    if length(tanks) != length(Enum.uniq(tanks)), do: Repo.rollback(:same_tank)
    parts
  end

  defp check_volumes!(batch, parts) do
    total = parts |> Enum.map(& &1.volume) |> Enum.reduce(Decimal.new(0), &Decimal.add/2)

    unless batch.volume_bbl && Decimal.equal?(total, batch.volume_bbl) do
      batch = Repo.preload(batch, :brand)

      Repo.rollback(
        {:volumes_must_add_up, total, batch.volume_bbl, Batches.label(batch, Batches.p_numbers())}
      )
    end
  end

  defp steps!(%Batch{id: id}) do
    Repo.all(from(s in Step, where: s.batch_id == ^id, preload: :step_type))
    |> Enum.sort_by(&Parts.order/1)
  end

  defp next_position(batch_id, day) do
    (Repo.one(
       from(s in Step,
         where: s.batch_id == ^batch_id and s.due_on == ^day,
         select: max(s.position)
       )
     ) || 0) + 1
  end

  defp put_link!(from_id, to_id, answer) do
    unless from_id == to_id or
             Repo.exists?(
               from(l in StepLink, where: l.from_step_id == ^from_id and l.to_step_id == ^to_id)
             ) do
      Repo.insert!(%StepLink{from_step_id: from_id, to_step_id: to_id, default_answer: answer})
    end
  end

  defp date!(value) do
    case value && Date.from_iso8601(to_string(value)) do
      {:ok, d} -> d
      _ -> Repo.rollback(:due_on_invalid)
    end
  end

  defp behavior_type!(behavior),
    do: Repo.one!(from(t in StepType, where: t.behavior == ^behavior, order_by: t.id, limit: 1))

  defp after?(a, b), do: Date.compare(a, b) == :gt
  defp truthy?(v), do: v in [true, "true", 1, "1"]
  defp stringify(attrs) when is_map(attrs), do: Map.new(attrs, fn {k, v} -> {to_string(k), v} end)
  defp stringify(_), do: %{}
end
