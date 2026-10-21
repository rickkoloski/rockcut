defmodule RockcutApi.Production.Schedule do
  @moduledoc """
  D47 §3.15: the Gantt's one request. `load/3` returns the active tanks
  (with their out-of-service periods), every phase and step type (retired
  ones too, so old steps keep their names and colors), the scheduled batches
  whose steps reach into the range (with vessels, steps and links), the
  standalone CIPs in it, the Brewery members (assignee pickers), the
  P-numbers and the next batch number, each tank's status line and the
  flags.

  Everything is loaded in a fixed number of queries, whatever the range.
  `batches/1` loads given batches the same way, for write responses.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Production, Repo}
  alias RockcutApi.Accounts.{Department, Membership, User}
  alias RockcutApi.Brewing.Batch

  alias RockcutApi.Production.{
    BatchVessel,
    Batches,
    Flags,
    Parts,
    Signoffs,
    Step,
    StepLink,
    TankStatus
  }

  # Days in the range, both ends included (the UI's "7 to 730 days").
  @min_days 7
  @max_days 730

  # Tank status and flags look past the view: every batch still going, and
  # what happened in the last 180 days (a tank emptied or cleaned then).
  @history_days 180

  @doc """
  The schedule from `from` to `to` (dates, 7 to 730 days with both ends
  included: `:range_invalid` otherwise) as seen on `today`: also each active tank's
  `statuses` (`TankStatus`) and the `flags` (`Flags`, with sign-offs),
  worked out over the range and every batch still going.
  """
  def load(%Date{} = from, %Date{} = to, %Date{} = today) do
    days = Date.diff(to, from) + 1

    if days < @min_days or days > @max_days do
      {:error, :range_invalid}
    else
      since = Date.add(today, -@history_days)

      in_range =
        Repo.all(
          from(s in Step,
            where: not is_nil(s.batch_id),
            group_by: s.batch_id,
            having: min(s.due_on) <= ^to and max(s.due_on) >= ^from,
            select: s.batch_id
          )
        )

      going =
        Repo.all(
          from(s in Step,
            join: b in Batch,
            on: b.id == s.batch_id,
            group_by: s.batch_id,
            having: max(s.due_on) >= ^since or fragment("max(?) != 'completed'", b.status),
            select: s.batch_id
          )
        )

      pnums = Batches.p_numbers()
      entries = batches(Enum.uniq(in_range ++ going), pnums)
      shown = MapSet.new(in_range)

      cips =
        Repo.all(
          from(s in Step,
            where: is_nil(s.batch_id) and (s.due_on >= ^since or is_nil(s.done_on)),
            order_by: [s.due_on, s.id],
            preload: [:step_type, :phase, :assignee, :done_by]
          )
        )

      tanks = Production.list_tanks() |> Enum.filter(&is_nil(&1.retired_at))
      phases = Production.list_phases()
      parts = Parts.build(entries)

      {:ok,
       %{
         from: from,
         to: to,
         today: today,
         tanks: tanks,
         phases: phases,
         step_types: Production.list_step_types(),
         batches: Enum.filter(entries, &MapSet.member?(shown, &1.batch.id)),
         cips:
           Enum.filter(
             cips,
             &(Date.compare(&1.due_on, from) != :lt and Date.compare(&1.due_on, to) != :gt)
           ),
         statuses: statuses(tanks, parts, cips, today, phases),
         flags:
           Flags.compute(%{parts: parts, cips: cips, tanks: tanks, today: today}, Signoffs.list()),
         p_numbers: pnums,
         next_batch_number: Batches.next_batch_number(),
         brewers: brewers()
       }}
    end
  end

  defp statuses(tanks, parts, cips, today, phases) do
    parts_by_tank = Enum.group_by(parts, & &1.tank_id)
    cips_by_tank = Enum.group_by(cips, & &1.tank_id)
    names = Map.new(phases, &{&1.id, &1.name})

    Enum.map(tanks, fn t ->
      TankStatus.for(
        t,
        Map.get(parts_by_tank, t.id, []),
        Map.get(cips_by_tank, t.id, []),
        today,
        names
      )
    end)
  end

  @doc """
  The scheduled batches `ids` with brand, template, vessels, steps (type,
  phase, assignee, done by) and links, each with `p_number` and `label` in
  its virtual fields (`Batch` has none, so this returns
  `%{batch:, vessels:, steps:, links:, p_number:, label:}` maps), by first
  step date.
  """
  def batches(ids, pnums \\ nil) do
    ids = Enum.uniq(ids)
    pnums = pnums || Batches.p_numbers()

    batches =
      Repo.all(from(b in Batch, where: b.id in ^ids, preload: [:brand, :template]))

    vessels =
      Repo.all(from(v in BatchVessel, where: v.batch_id in ^ids, order_by: v.vessel_index))
      |> Enum.group_by(& &1.batch_id)

    steps =
      Repo.all(
        from(s in Step,
          where: s.batch_id in ^ids,
          order_by: [s.due_on, s.position, s.id],
          preload: [:step_type, :phase, :assignee, :done_by]
        )
      )
      |> Enum.group_by(& &1.batch_id)

    batch_of = for {batch_id, list} <- steps, s <- list, into: %{}, do: {s.id, batch_id}
    step_ids = Map.keys(batch_of)

    links =
      Repo.all(from(l in StepLink, where: l.from_step_id in ^step_ids, order_by: l.id))
      |> Enum.group_by(&batch_of[&1.from_step_id])

    batches
    |> Enum.filter(&Map.has_key?(vessels, &1.id))
    |> Enum.map(fn b ->
      %{
        batch: b,
        p_number: pnums[b.id],
        label: Batches.label(b, pnums),
        vessels: vessels[b.id],
        steps: Map.get(steps, b.id, []),
        links: Map.get(links, b.id, [])
      }
    end)
    |> Enum.sort_by(fn %{batch: b, steps: s} ->
      {s |> Enum.map(&Date.to_gregorian_days(&1.due_on)) |> Enum.min(fn -> 0 end), b.id}
    end)
  end

  @doc "The Brewery's active people, by name: who steps can be assigned to."
  def brewers do
    Repo.all(
      from(u in User,
        join: m in Membership,
        on: m.user_id == u.id,
        join: d in Department,
        on: d.id == m.department_id,
        # authz-boundary: data invariant (the assignable people, as Authz.can_take_task?/2)
        where: d.key == "brewery" and u.active and u.kind == "person",
        distinct: true,
        order_by: u.name,
        select: %{id: u.id, name: u.name}
      )
    )
  end
end
