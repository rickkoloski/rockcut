defmodule RockcutApi.Production.Schedule do
  @moduledoc """
  D47 §3.15: the Gantt's one request. `load/3` returns the active tanks
  (with their out-of-service periods), every phase and step type (retired
  ones too, so old steps keep their names and colors), the scheduled batches
  whose steps reach into the range (with vessels, steps and links), the
  standalone CIPs in it, the Brewery members (assignee pickers), the
  P-numbers and the next batch number. Task 2 adds statuses and flags.

  Everything is loaded in a fixed number of queries, whatever the range.
  `batches/1` loads given batches the same way, for write responses.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Production, Repo}
  alias RockcutApi.Accounts.{Department, Membership, User}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{BatchVessel, Batches, Step, StepLink}

  @max_days 730

  @doc """
  The schedule from `from` to `to` (dates, at most 730 days apart:
  `:range_invalid` otherwise) as seen on `today`.
  """
  def load(%Date{} = from, %Date{} = to, %Date{} = today) do
    days = Date.diff(to, from)

    if days < 0 or days > @max_days do
      {:error, :range_invalid}
    else
      batch_ids =
        Repo.all(
          from(s in Step,
            where: not is_nil(s.batch_id),
            group_by: s.batch_id,
            having: min(s.due_on) <= ^to and max(s.due_on) >= ^from,
            select: s.batch_id
          )
        )

      pnums = Batches.p_numbers()

      cips =
        Repo.all(
          from(s in Step,
            where: is_nil(s.batch_id) and s.due_on >= ^from and s.due_on <= ^to,
            order_by: [s.due_on, s.id],
            preload: [:step_type, :phase, :assignee, :done_by]
          )
        )

      {:ok,
       %{
         from: from,
         to: to,
         today: today,
         tanks: Production.list_tanks() |> Enum.filter(&is_nil(&1.retired_at)),
         phases: Production.list_phases(),
         step_types: Production.list_step_types(),
         batches: batches(batch_ids),
         cips: cips,
         p_numbers: pnums,
         next_batch_number: Batches.next_batch_number(),
         brewers: brewers()
       }}
    end
  end

  @doc """
  The scheduled batches `ids` with brand, template, vessels, steps (type,
  phase, assignee, done by) and links, each with `p_number` and `label` in
  its virtual fields (`Batch` has none, so this returns
  `%{batch:, vessels:, steps:, links:, p_number:, label:}` maps), by first
  step date.
  """
  def batches(ids) do
    ids = Enum.uniq(ids)
    pnums = Batches.p_numbers()

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
