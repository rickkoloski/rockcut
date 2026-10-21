defmodule RockcutApi.Production.TankStatus do
  @moduledoc """
  D47 §3.8: a tank's status line for `today` (Colorado). Pure: it takes the
  tank (with its outages), the parts that were ever in it (`Parts`), its
  standalone CIPs and the phase names.

  In order:
  - **Out of service** today: "Out of service · Gasket · through Oct 30".
  - **Beer in it** (a part filled and not emptied): "Day 18 · Fermentation ·
    68° · set to 58° today". Day N counts from the first Brew day's done
    date (plan decision 9). The phase is the latest started one (decision 8):
    a done step that starts a phase, or a phase marker whose day has come
    and whose linked predecessors are all done. The temperature is the last
    checked-off Set temp, else the Brew day's. A Set temp due today and not
    done adds "set to 48° today"; an overdue one "48° change late" (`alert`).
  - **Emptied**, cleaned since: "Sani 6 days"; not cleaned: "Empty · dirty 3
    days", plus "no CIP planned" (`alert`) when no CIP is dated after.
  - **Never used**: "Empty · clean" ("Sani N days" after a standalone CIP).
  """
  alias RockcutApi.Production.Parts

  @doc """
  `%{tank_id, state, line, alert, batch_id, batch_label}`; `state` is
  `out`, `in_use`, `sani`, `dirty` or `clean`. `batch_*` name the batch in
  the tank (also while it's out of service).
  """
  def for(tank, parts, cips, today, phase_names) do
    current = parts |> Enum.filter(&Parts.in_tank?/1) |> Enum.max_by(&fill_day/1, fn -> nil end)

    base = %{
      tank_id: tank.id,
      batch_id: current && current.batch_id,
      batch_label: current && current.label,
      alert: false
    }

    cond do
      outage = current_outage(tank, today) ->
        Map.merge(base, %{state: "out", line: outage_line(outage)})

      current ->
        Map.merge(base, beer(current, today, phase_names))

      true ->
        Map.merge(base, empty(parts, cips, today))
    end
  end

  defp fill_day(part), do: Date.to_gregorian_days(part.fill.done_on)

  defp current_outage(tank, today) do
    Enum.find(tank.outages || [], fn o ->
      Date.compare(o.starts_on, today) != :gt and
        (is_nil(o.ends_on) or Date.compare(o.ends_on, today) != :lt)
    end)
  end

  defp outage_line(o) do
    ["Out of service", o.reason, o.ends_on && "through #{Calendar.strftime(o.ends_on, "%b %-d")}"]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" · ")
  end

  defp beer(part, today, phase_names) do
    steps = part.batch_steps
    brew = part.first_brew
    day = brew && brew.done_on && Date.diff(today, brew.done_on)
    phase_id = phase_on(steps, part.links, today)

    set_temps = Enum.filter(steps, &(Parts.behavior(&1) == "set_temp"))

    temperature =
      case set_temps
           |> Enum.filter(& &1.done_on)
           |> Enum.max_by(&{Date.to_gregorian_days(&1.done_on), &1.id}, fn -> nil end) do
        nil -> brew && brew.temperature
        s -> s.temperature
      end

    open = Enum.reject(set_temps, & &1.done_on)

    late =
      open
      |> Enum.filter(&(Date.compare(&1.due_on, today) == :lt))
      |> Enum.min_by(&Parts.order/1, fn -> nil end)

    due = Enum.find(open, &(&1.due_on == today))

    extra =
      cond do
        late -> "#{late.temperature}° change late"
        due -> "set to #{due.temperature}° today"
        true -> nil
      end

    line =
      [
        day && "Day #{day}",
        phase_id && phase_names[phase_id],
        temperature && "#{temperature}°",
        extra
      ]
      |> Enum.reject(&is_nil/1)
      |> Enum.join(" · ")

    %{state: "in_use", line: line, alert: late != nil}
  end

  @doc """
  The phase in force on `today` for a batch's `steps` and `links`: the
  latest started by a done typed step (on its done date) or by a phase
  marker that has started (on its day). A marker starts when its day has
  come and each step it follows is done, or is a marker that has started:
  markers can't be checked off in D47, so a chain of them (Lag, then
  Fermentation) starts one after the other.
  """
  def phase_on(steps, links, today) do
    by_id = Map.new(steps, &{&1.id, &1})
    into = Enum.group_by(links, & &1.to_step_id, & &1.from_step_id)

    steps
    |> Enum.filter(& &1.phase_id)
    |> Enum.flat_map(fn s ->
      cond do
        s.step_type_id && s.done_on ->
          [{s.done_on, s}]

        is_nil(s.step_type_id) and started?(s, by_id, into, today, MapSet.new()) ->
          [{s.due_on, s}]

        true ->
          []
      end
    end)
    |> Enum.max_by(fn {d, s} -> {Date.to_gregorian_days(d), s.position, s.id} end, fn -> nil end)
    |> case do
      nil -> nil
      {_, s} -> s.phase_id
    end
  end

  # A step counts as done for the markers after it: checked off, or a
  # marker that has started. `seen` guards against a loop in bad data.
  defp started?(marker, by_id, into, today, seen) do
    Date.compare(marker.due_on, today) != :gt and
      Enum.all?(Map.get(into, marker.id, []), fn id ->
        case by_id[id] do
          nil ->
            true

          %{done_on: d} when d != nil ->
            true

          %{step_type_id: nil} = m ->
            not MapSet.member?(seen, m.id) and
              started?(m, by_id, into, today, MapSet.put(seen, marker.id))

          _ ->
            false
        end
      end)
  end

  defp empty(parts, cips, today) do
    # The CIPs that clean up after beer that was here (the filled parts'
    # own; a planned batch's comes after its own beer) and the standalone ones.
    all_cips =
      parts |> Enum.filter(&Parts.filled?/1) |> Enum.flat_map(&own_cips/1) |> Kernel.++(cips)

    last_clean =
      all_cips
      |> Enum.map(& &1.done_on)
      |> Enum.reject(&is_nil/1)
      |> Enum.max(Date, fn -> nil end)

    emptied =
      parts
      |> Enum.filter(&Parts.emptied?/1)
      |> Enum.map(& &1.exit.done_on)
      |> Enum.max(Date, fn -> nil end)

    cond do
      emptied && !(last_clean && Date.compare(last_clean, emptied) != :lt) ->
        planned? =
          Enum.any?(all_cips, &(is_nil(&1.done_on) and Date.compare(&1.due_on, emptied) != :lt))

        line = "Empty · dirty #{Date.diff(today, emptied)} days"

        if planned?,
          do: %{state: "dirty", line: line},
          else: %{state: "dirty", line: line <> " · no CIP planned", alert: true}

      last_clean ->
        %{state: "sani", line: "Sani #{Date.diff(today, last_clean)} days"}

      true ->
        %{state: "clean", line: "Empty · clean"}
    end
  end

  defp own_cips(part),
    do:
      Enum.filter(
        part.steps,
        &(Parts.behavior(&1) == "cip" and &1.vessel_index == part.vessel_index)
      )
end
