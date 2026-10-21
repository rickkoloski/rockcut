defmodule RockcutApi.Production.Parts do
  @moduledoc """
  D47: a scheduled batch as **parts**, one per vessel (the beer in one tank),
  for tank status (§3.8) and flags (§3.9). Pure: built from
  `Schedule.batches/1` entries, no queries.

  A part's steps are its vessel's (`vessel_index == k`, which includes the
  Transfer/Filter that fills it) and the step that empties it. It is
  **filled** by its first Brew day (the first tank) or that Transfer/Filter,
  and **emptied** by its exit: a full Package or a Split in it, or the next
  Transfer/Filter (a partial Package isn't an exit). Its CIP is its
  vessel's latest CIP & Sanitize. It runs from its fill (or first step) to
  its last step, its CIP included: the bar on the Gantt.

  **Occupancy** (lead decisions 5, N4), the one definition every place
  uses: once its exit is done a part holds its tank from its fill to its
  exit, and no longer (`end`, `occupied_until/1`). Its own CIP, done or
  planned, only says when the tank gets cleaned: between the exit and that
  CIP the tank is dirty, not occupied ("Filling a dirty tank" looks after
  that), and a `leftover_cip` dated in another part's stay is flagged like
  a standalone one. Unfinished steps dated after a done exit are
  `stranded` (flagged as out of order, drawn red).
  """
  alias RockcutApi.Production.Steps

  @doc "Every vessel of every entry as a part."
  def build(entries) do
    for entry <- entries, v <- entry.vessels, do: part(entry, v)
  end

  @doc "One part: `entry` from `Schedule.batches/1`, `vessel` one of its vessels."
  def part(entry, vessel) do
    k = vessel.vessel_index
    steps = entry.steps
    first_brew = first_brew(steps)

    fill =
      if k == 0,
        do: first_brew,
        else:
          steps
          |> Enum.filter(&(behavior(&1) == "transfer" and &1.vessel_index == k))
          |> earliest()

    exit =
      steps
      |> Enum.filter(fn s ->
        case behavior(s) do
          "package" -> s.vessel_index == k and not s.package_partial
          "split" -> s.vessel_index == k
          "transfer" -> s.vessel_index == k + 1
          _ -> false
        end
      end)
      |> earliest()

    own = Enum.filter(steps, &(&1.vessel_index == k))
    span = if exit && exit not in own, do: [exit | own], else: own
    cip = own |> Enum.filter(&(behavior(&1) == "cip")) |> Enum.max_by(&order/1, fn -> nil end)
    days = Enum.map(span, & &1.due_on)
    exited = exit && exit.done_on && exit.due_on

    stranded =
      if exited,
        do: Enum.filter(own, &(is_nil(&1.done_on) and &1 != cip and after?(&1.due_on, exited))),
        else: []

    last = if exited, do: exited, else: Enum.max(days, Date, fn -> nil end)

    %{
      id: "#{entry.batch.id}.#{k}",
      batch_id: entry.batch.id,
      vessel_index: k,
      tank_id: vessel.tank_id,
      label: entry.label,
      volume: entry.batch.volume_bbl,
      status: entry.batch.status,
      fill: fill,
      exit: exit,
      cip: cip,
      first_brew: first_brew,
      start: (fill && fill.due_on) || Enum.min(days, Date, fn -> nil end),
      end: last,
      steps: span,
      stranded: stranded,
      leftover_cip: if(exited && cip && not after?(exited, cip.due_on), do: cip),
      batch_steps: steps,
      links: entry.links
    }
  end

  @doc ~S|"Galactic #40", or "Fest #38 (after transfer 1)" for a later tank.|
  def label(%{label: label, vessel_index: 0}), do: label
  def label(%{label: label, vessel_index: k}), do: "#{label} (after transfer #{k})"

  @doc "The last day the part holds its tank: its exit once that's done, else its end."
  def occupied_until(part), do: part.end

  def filled?(part), do: done?(part.fill)
  def emptied?(part), do: done?(part.exit)

  @doc "The beer is in the tank: filled and not emptied."
  def in_tank?(part), do: filled?(part) and not emptied?(part)

  @doc "Emptied and, if it has a CIP, cleaned: nothing about it is still to do."
  def finished?(part), do: emptied?(part) and (part.cip == nil or done?(part.cip))

  def done?(nil), do: false
  def done?(step), do: step.done_on != nil

  @doc "The batch's first Brew day: its Brew day with the lowest id."
  def first_brew(steps) do
    steps |> Enum.filter(&(behavior(&1) == "brew")) |> Enum.min_by(& &1.id, fn -> nil end)
  end

  def behavior(step), do: Steps.behavior(step)

  @doc "A step's place in time: its date, then its position in the day, then id."
  def order(step), do: {Date.to_gregorian_days(step.due_on), step.position, step.id}

  defp after?(a, b), do: Date.compare(a, b) == :gt

  defp earliest([]), do: nil
  defp earliest(steps), do: Enum.min_by(steps, &order/1)
end
