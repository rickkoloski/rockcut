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
  vessel's latest CIP (any variant, D49). It runs from its fill (or first step) to
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
  alias RockcutApi.Production.{StepLink, Steps}

  @doc "Every vessel of every entry as a part."
  def build(entries) do
    for entry <- entries, v <- entry.vessels, do: part(entry, v)
  end

  @doc "One part: `entry` from `Schedule.batches/1`, `vessel` one of its vessels."
  def part(entry, vessel) do
    k = vessel.vessel_index
    steps = entry.steps
    # D48: a split part is filled by its parent's Split and counts its days
    # from the parent's first Brew day.
    origin = Map.get(entry, :origin)
    first_brew = (origin && origin.first_brew) || first_brew(steps)

    fill =
      cond do
        k == 0 and origin != nil ->
          origin.fill

        k == 0 ->
          first_brew

        true ->
          steps
          |> Enum.filter(&(behavior(&1) == "transfer" and &1.vessel_index == k))
          |> earliest()
      end

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
      links: entry.links,
      # D48: a split part's parent's steps and links, its history before the split.
      history:
        if(origin, do: %{steps: origin.steps, links: origin.links}, else: %{steps: [], links: []})
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

  @doc """
  D48 DEV QA Y1: a split part's place after its parent's Split, as links
  (not stored): `split` → each of the part's first steps (`steps` with no
  link into them from another of `steps`; `links` the part's), `move_all`.
  Moves follow them (`Steps`), and "Steps out of order" checks them (`Flags`).
  """
  def split_links(split, steps, links) do
    ids = MapSet.new(steps, & &1.id)

    led =
      for l <- links, MapSet.member?(ids, l.from_step_id), into: MapSet.new(), do: l.to_step_id

    for s <- steps,
        not MapSet.member?(led, s.id),
        do: %StepLink{from_step_id: split.id, to_step_id: s.id, default_answer: "move_all"}
  end

  @doc "A step's place in time: its date, then its position in the day, then id."
  def order(step), do: {Date.to_gregorian_days(step.due_on), step.position, step.id}

  ## Clean or dirty (D48 §3.8; D49 §3.12a)

  @doc """
  A tank's cleanliness record, the one timeline every place uses: each
  done exit of `parts` (the parts that were in it) leaves it dirty, each
  done CIP (the filled parts' own and the standalone `cips`) by its variant
  (D49): CIP & Sanitize leaves it `:sanitized`, CIP - no sani `:cleaned`,
  and a Sanitize (`:sanitize`) sanitizes it only if it's clean
  (`condition/1`); each mark (`ConditionMark`) leaves it as marked
  (`clean` is sanitized). `[%{on, state, source, at, mark, step}]` in order;
  `source` is `:exit`, `:cip` or `:mark`.

  `planned: true` (D49, for a fill that's still to come) counts what's
  planned as well, on its due day: every part's exit and own CIPs.
  """
  def condition_events(parts, cips, marks \\ [], opts \\ []) do
    planned? = opts[:planned] == true
    on = fn s -> s.done_on || (planned? && s.due_on) end

    exits =
      for p <- parts,
          p.exit,
          day = on.(p.exit),
          do: %{
            on: day,
            state: :dirty,
            source: :exit,
            at: p.exit.completed_at,
            mark: nil,
            step: p.exit
          }

    own = if planned?, do: parts, else: Enum.filter(parts, &filled?/1)

    cleans =
      for c <- Enum.flat_map(own, &own_cips/1) ++ cips,
          day = on.(c),
          do: %{
            on: day,
            state: cip_state(c),
            source: :cip,
            at: c.completed_at,
            mark: nil,
            step: c
          }

    marked =
      for m <- marks,
          do: %{
            on: m.marked_on,
            state: mark_state(m.state),
            source: :mark,
            at: m.inserted_at,
            mark: m,
            step: nil
          }

    Enum.sort_by(exits ++ cleans ++ marked, &condition_order/1)
  end

  @doc """
  Where `events` (`condition_events/4`) leave the tank, or nil (never
  used): the latest that counts, by date; on the same day a CIP or a mark
  counts after an exit (lead decisions 5, N4), and otherwise the later
  recorded one wins. A Sanitize counts on a clean tank (`:cleaned`,
  `:sanitized` or never used) and makes it `:sanitized`; on a dirty one it
  doesn't count. Its `state` is `:dirty`, `:cleaned` or `:sanitized`.
  """
  def latest_condition(events), do: events |> condition() |> elem(0)

  @doc """
  `{latest_condition, sanitized_dirty}`: also the Sanitize steps done on a
  dirty tank, which leave it dirty ("The tank was dirty: run a CIP first.").
  """
  def condition(events) do
    events
    |> Enum.sort_by(&condition_order/1)
    |> Enum.reduce({nil, []}, fn
      %{state: :sanitize} = e, {%{state: :dirty} = now, wasted} -> {now, [e.step | wasted]}
      %{state: :sanitize} = e, {_, wasted} -> {%{e | state: :sanitized}, wasted}
      e, {_, wasted} -> {e, wasted}
    end)
    |> then(fn {now, wasted} -> {now, Enum.reverse(wasted)} end)
  end

  defp condition_order(e) do
    at = if e.at, do: DateTime.to_unix(e.at), else: 0
    seq = (e.step && e.step.id) || (e.mark && e.mark.id) || 0
    {Date.to_gregorian_days(e.on), if(e.source == :exit, do: 0, else: 1), at, seq}
  end

  defp cip_state(step) do
    case Steps.cip_method(step) do
      "no_sani" -> :cleaned
      "sanitize" -> :sanitize
      _ -> :sanitized
    end
  end

  defp mark_state("clean"), do: :sanitized
  defp mark_state("cleaned"), do: :cleaned
  defp mark_state("dirty"), do: :dirty

  @doc "A part's own CIP steps (in its vessel), every variant."
  def own_cips(part),
    do: Enum.filter(part.steps, &(behavior(&1) == "cip" and &1.vessel_index == part.vessel_index))

  @doc """
  D49 §3.12a: a CIP that cleans the tank, CIP & Sanitize or CIP - no sani,
  not a Sanitize: what counts as a planned CIP for the dirty flags.
  """
  def cleans?(step), do: behavior(step) == "cip" and Steps.cip_method(step) != "sanitize"

  defp after?(a, b), do: Date.compare(a, b) == :gt

  defp earliest([]), do: nil
  defp earliest(steps), do: Enum.min_by(steps, &order/1)
end
