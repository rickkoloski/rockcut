defmodule RockcutApi.Production.Flags do
  @moduledoc """
  D47 §3.9: what looks wrong on the schedule. Pure: `compute/2` takes the
  parts (`Parts`), standalone CIPs, tanks (with outages and capacity) and
  today, plus the sign-offs, and returns every flag.

  Each flag has a stable `key` (kind and ids) and a `signature` (a short
  hash of the dates, tank and volume involved). It's `signed_off` while a
  sign-off holds the current signature; when the signature changes it's
  open again with `was_signed_off`.

  Only what's still to do is flagged: unfinished parts (`Parts.finished?/1`),
  steps not done, CIPs not done. "Dirty, no CIP planned" looks at each tank's
  last emptying.
  """
  alias RockcutApi.Production.Parts

  @no_tank_days 3

  # In the comprehensions below a `x = …` binding is also a filter: only
  # values that are never nil or false are bound that way.

  @doc """
  The flags, open first, each `%{key, kind, message, signature, batch_ids,
  tank_id, signed_off, was_signed_off, signoff}`. `world`: `%{parts, cips,
  tanks, today}`; `signoffs`: `FlagSignoff`s with `user` loaded.
  """
  def compute(world, signoffs) do
    tanks = Map.new(world.tanks, &{&1.id, &1})
    live = Enum.reject(world.parts, &Parts.finished?/1)
    by_tank = world.parts |> Enum.filter(& &1.tank_id) |> Enum.group_by(& &1.tank_id)
    cips_by_tank = Enum.group_by(world.cips, & &1.tank_id)
    signed = Map.new(signoffs, &{&1.flag_key, &1})

    (overlaps(live, tanks) ++
       too_big(live, tanks) ++
       dirty_fills(live, by_tank, cips_by_tank, tanks) ++
       dirty_no_cip(by_tank, cips_by_tank, tanks) ++
       out_of_order(live) ++
       no_tank(live, world.today) ++
       out_of_service(live, world.cips, tanks) ++
       cip_with_beer(live, world.cips, tanks))
    |> Enum.uniq_by(& &1.key)
    |> Enum.map(&with_signoff(&1, signed[&1.key]))
    |> Enum.sort_by(&{&1.signed_off, &1.key})
  end

  # Two parts in one tank overlap: they share more than a boundary day (a
  # CIP and the next fill on the same day is normal).
  defp overlaps(live, tanks) do
    for {tank_id, parts} <- Enum.group_by(Enum.filter(live, & &1.tank_id), & &1.tank_id),
        [a, b] <- pairs(Enum.sort_by(parts, &{Date.to_gregorian_days(&1.start), &1.id})),
        a.batch_id != b.batch_id,
        Date.compare(b.start, a.end) == :lt and Date.compare(a.start, b.end) == :lt do
      flag(:tank_overlap, [a.id, b.id], [tank_id, a.start, a.end, b.start, b.end],
        message: "#{Parts.label(a)} and #{Parts.label(b)} overlap in #{tanks[tank_id].name}.",
        batch_ids: [a.batch_id, b.batch_id],
        tank_id: tank_id
      )
    end
  end

  defp too_big(live, tanks) do
    for p <- live,
        tank = p.tank_id && tanks[p.tank_id],
        tank && p.volume && Decimal.gt?(p.volume, tank.capacity_bbl) do
      flag(
        :too_big,
        [p.id],
        [tank.id, Decimal.to_string(p.volume), Decimal.to_string(tank.capacity_bbl)],
        message:
          "#{Parts.label(p)} (#{bbl(p.volume)}) is bigger than #{tank.name} (#{bbl(tank.capacity_bbl)}).",
        batch_ids: [p.batch_id],
        tank_id: tank.id
      )
    end
  end

  # A planned fill into a tank whose previous part's CIP comes after it or
  # is missing, with no standalone CIP in between.
  defp dirty_fills(live, by_tank, cips_by_tank, tanks) do
    for p <- live,
        p.tank_id && p.fill && is_nil(p.fill.done_on),
        prev = previous(by_tank[p.tank_id], p),
        prev,
        # A generator, not `prev_cip = …`: in `for` a binding is also a
        # filter, and a missing CIP (nil) would drop the flag.
        prev_cip <- [prev.cip],
        is_nil(prev_cip) or Date.compare(prev_cip.due_on, p.fill.due_on) == :gt,
        emptied = (prev.exit && prev.exit.due_on) || prev.end,
        not Enum.any?(
          Map.get(cips_by_tank, p.tank_id, []),
          &(Date.compare(&1.due_on, emptied) != :lt and
              Date.compare(&1.due_on, p.fill.due_on) != :gt)
        ) do
      flag(:dirty_fill, [p.id, prev.id], [p.tank_id, p.fill.due_on, prev_cip && prev_cip.due_on],
        message:
          "#{Parts.label(p)} fills #{tanks[p.tank_id].name} before it's cleaned after #{Parts.label(prev)}.",
        batch_ids: [p.batch_id, prev.batch_id],
        tank_id: p.tank_id
      )
    end
  end

  # The part in the same tank that started last before `p` did.
  defp previous(parts, p) do
    parts
    |> Enum.filter(&(&1.id != p.id and Date.compare(&1.start, p.start) == :lt))
    |> Enum.max_by(&{Date.to_gregorian_days(&1.start), &1.id}, fn -> nil end)
  end

  # A tank's last emptying with no CIP dated on or after it.
  defp dirty_no_cip(by_tank, cips_by_tank, tanks) do
    for {tank_id, parts} <- by_tank,
        tank = tanks[tank_id],
        tank,
        last =
          parts
          |> Enum.filter(&Parts.emptied?/1)
          |> Enum.max_by(&Date.to_gregorian_days(&1.exit.done_on), fn -> nil end),
        last,
        emptied = last.exit.done_on,
        not Enum.any?(
          parts,
          &(&1.id != last.id and Parts.filled?(&1) and
              Date.compare(&1.fill.done_on, emptied) != :lt)
        ),
        cips =
          Enum.filter(
            last.steps,
            &(Parts.behavior(&1) == "cip" and &1.vessel_index == last.vessel_index)
          ) ++ Map.get(cips_by_tank, tank_id, []),
        not Enum.any?(cips, &(Date.compare(&1.due_on, emptied) != :lt)) do
      flag(:dirty_no_cip, [tank_id, last.id], [tank_id, emptied],
        message: "#{tank.name} was emptied (#{Parts.label(last)}) and has no CIP planned.",
        batch_ids: [last.batch_id],
        tank_id: tank_id
      )
    end
  end

  # A step dated before a step it follows (the later one not done yet).
  defp out_of_order(live) do
    for {_batch_id, [p | _]} <- Enum.group_by(live, & &1.batch_id),
        by_id = Map.new(p.batch_steps, &{&1.id, &1}),
        l <- p.links,
        from = by_id[l.from_step_id],
        to = by_id[l.to_step_id],
        (from && to && is_nil(to.done_on)) and Date.compare(to.due_on, from.due_on) == :lt do
      flag(:out_of_order, [l.id], [from.due_on, to.due_on],
        message:
          "#{p.label}: #{RockcutApi.Production.Steps.name(to)} is before #{RockcutApi.Production.Steps.name(from)}, the step it follows.",
        batch_ids: [p.batch_id],
        tank_id: nil
      )
    end
  end

  defp no_tank(live, today) do
    for p <- live,
        is_nil(p.tank_id) and p.fill != nil and is_nil(p.fill.done_on),
        Date.diff(p.fill.due_on, today) <= @no_tank_days do
      flag(:no_tank, [p.id], [p.fill.due_on],
        message:
          "#{Parts.label(p)} has no tank and fills #{Calendar.strftime(p.fill.due_on, "%a %b %-d")}.",
        batch_ids: [p.batch_id],
        tank_id: nil
      )
    end
  end

  defp out_of_service(live, cips, tanks) do
    part_flags =
      for p <- live,
          tank = p.tank_id && tanks[p.tank_id],
          tank,
          o <- tank.outages || [],
          overlaps?(p.start, p.end, o) do
        flag(:out_of_service, [p.id, o.id], [p.start, p.end, o.starts_on, o.ends_on],
          message:
            "#{Parts.label(p)} is in #{tank.name} while it's out of service (#{period(o)}).",
          batch_ids: [p.batch_id],
          tank_id: tank.id
        )
      end

    cip_flags =
      for c <- cips,
          is_nil(c.done_on),
          tank = tanks[c.tank_id],
          tank,
          o <- tank.outages || [],
          overlaps?(c.due_on, c.due_on, o) do
        flag(:out_of_service, ["cip#{c.id}", o.id], [c.due_on, o.starts_on, o.ends_on],
          message:
            "The CIP & Sanitize in #{tank.name} on #{Calendar.strftime(c.due_on, "%b %-d")} is while it's out of service (#{period(o)}).",
          batch_ids: [],
          tank_id: tank.id
        )
      end

    part_flags ++ cip_flags
  end

  # A standalone CIP dated while a batch's beer is in the tank (after its
  # fill, before its exit).
  defp cip_with_beer(live, cips, tanks) do
    for c <- cips,
        is_nil(c.done_on),
        p <- live,
        p.tank_id == c.tank_id,
        p.fill != nil,
        beer_until = (p.exit && p.exit.due_on) || p.end,
        Date.compare(c.due_on, p.fill.due_on) == :gt and Date.compare(c.due_on, beer_until) == :lt do
      flag(:cip_with_beer, ["cip#{c.id}", p.id], [c.due_on, p.fill.due_on, beer_until],
        message:
          "A CIP & Sanitize in #{tanks[c.tank_id].name} on #{Calendar.strftime(c.due_on, "%b %-d")} while #{Parts.label(p)} is in it.",
        batch_ids: [p.batch_id],
        tank_id: c.tank_id
      )
    end
  end

  ## Helpers

  defp flag(kind, ids, signed, fields) do
    %{
      key: Enum.join([kind | ids], ":"),
      kind: Atom.to_string(kind),
      signature: signature(signed),
      message: fields[:message],
      batch_ids: Enum.uniq(fields[:batch_ids]),
      tank_id: fields[:tank_id]
    }
  end

  @doc "A short hash of what a flag is about."
  def signature(term) do
    :crypto.hash(:sha256, :erlang.term_to_binary(term))
    |> Base.encode16(case: :lower)
    |> binary_part(0, 16)
  end

  defp with_signoff(flag, nil),
    do: Map.merge(flag, %{signed_off: false, was_signed_off: false, signoff: nil})

  defp with_signoff(flag, s) do
    current = s.signature == flag.signature

    Map.merge(flag, %{
      signed_off: current,
      was_signed_off: not current,
      signoff: %{
        user_id: s.user_id,
        user_name: s.user && s.user.name,
        note: s.note,
        signed_at: s.signed_at
      }
    })
  end

  defp pairs(list) do
    for {a, i} <- Enum.with_index(list), b <- Enum.drop(list, i + 1), do: [a, b]
  end

  defp overlaps?(from, to, o) do
    Date.compare(to, o.starts_on) != :lt and
      (is_nil(o.ends_on) or Date.compare(from, o.ends_on) != :gt)
  end

  defp period(%{starts_on: s, ends_on: nil}), do: "from #{Calendar.strftime(s, "%b %-d")}"

  defp period(%{starts_on: s, ends_on: e}),
    do: "#{Calendar.strftime(s, "%b %-d")}–#{Calendar.strftime(e, "%b %-d")}"

  defp bbl(%Decimal{} = d), do: "#{d |> Decimal.normalize() |> Decimal.to_string(:normal)} bbl"
end
