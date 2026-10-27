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
  links with a step not done, CIPs not done (but a done CIP while beer is
  in the tank is still flagged). A part whose exit is done holds its tank
  only to the exit (`Parts.occupied_until/1`). "Dirty, no CIP planned" looks at each tank's
  last emptying. D48: clean / dirty marks (`world.marks`) count as cleaning
  and emptying, through the one rule in `Parts.latest_condition/1`.

  D49 §3.12a: a CIP - no sani or a Clean not sanitized mark cleans the tank
  for the dirty flags, but a fill after it is "Filling a tank that isn't
  sanitized" (`unsanitized_fill`, soft: it can be signed off) unless a
  Sanitize or CIP & Sanitize comes first. A Sanitize never counts as a CIP.

  D49 §3.12b: a flag about a pencilled batch (its first batch) is `muted`:
  listed last, not counted, and it can't be signed off (`Signoffs`). Tank
  overlap between a scheduled and a pencilled batch is two flags: the
  scheduled one's, as before, and the pencilled one's, muted (its key ends
  in `:pencilled`). "No tank assigned" doesn't apply to a pencilled batch.
  """
  alias RockcutApi.Production.{Parts, Steps}

  @no_tank_days 3

  # D48 lead decisions 1: the signature recipe's version, the first part of
  # every signature's canonical string ("v1|…"). Changing which values go
  # into any flag's signature, or how they're written (`canonical/1`), means
  # bumping it AND shipping a data migration that recomputes the stored
  # `flag_signoffs.signature` of every sign-off that still matches under the
  # old recipe; without it, every sign-off reads as reopened ("Was signed
  # off by …, but something changed since").
  @signature_version "v1"

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
    marks_by_tank = world |> Map.get(:marks, []) |> Enum.group_by(& &1.tank_id)
    signed = Map.new(signoffs, &{&1.flag_key, &1})

    # Standalone CIPs, and a done exit's leftover CIP (it only cleans the
    # tank; lead decisions 5, N4): flagged the same way.
    loose_cips =
      world.cips ++
        for p <- world.parts, c = p.leftover_cip, c, p.tank_id, do: %{c | tank_id: p.tank_id}

    (overlaps(live, tanks) ++
       too_big(live, tanks) ++
       dirty_fills(live, by_tank, cips_by_tank, marks_by_tank, tanks) ++
       marked_dirty_fills(live, by_tank, cips_by_tank, marks_by_tank, tanks) ++
       unsanitized_fills(live, by_tank, cips_by_tank, marks_by_tank, tanks) ++
       dirty_no_cip(by_tank, cips_by_tank, marks_by_tank, tanks) ++
       marked_dirty_no_cip(by_tank, cips_by_tank, marks_by_tank, tanks) ++
       out_of_order(world.parts) ++
       transfer_order(world.parts, tanks) ++
       no_tank(live, world.today) ++
       out_of_service(live, loose_cips, tanks) ++
       cip_with_beer(live, loose_cips, tanks))
    |> Enum.uniq_by(& &1.key)
    |> Enum.flat_map(&mute(&1, pencilled(world.parts)))
    |> Enum.map(&with_signoff(&1, signed[&1.key]))
    |> Enum.sort_by(&{&1.muted, &1.signed_off, &1.key})
  end

  defp pencilled(parts), do: for(p <- parts, p.pencilled, into: MapSet.new(), do: p.batch_id)

  # D49 §3.12b: muted when it's about a pencilled batch (its first batch);
  # an overlap of a scheduled and a pencilled batch is one flag each.
  defp mute(%{kind: "tank_overlap", batch_ids: [a, b]} = flag, pencilled) do
    case {MapSet.member?(pencilled, a), MapSet.member?(pencilled, b)} do
      {x, x} ->
        [Map.put(flag, :muted, x)]

      {a_pencilled, _} ->
        {pen, sched} = if a_pencilled, do: {a, b}, else: {b, a}

        [
          Map.merge(flag, %{batch_ids: [sched], muted: false}),
          Map.merge(flag, %{key: flag.key <> ":pencilled", batch_ids: [pen], muted: true})
        ]
    end
  end

  defp mute(%{batch_ids: [first | _]} = flag, pencilled),
    do: [Map.put(flag, :muted, MapSet.member?(pencilled, first))]

  defp mute(flag, _pencilled), do: [Map.put(flag, :muted, false)]

  # Two parts in one tank overlap: they share more than a boundary day (a
  # CIP and the next fill on the same day is normal).
  defp overlaps(live, tanks) do
    for {tank_id, parts} <- Enum.group_by(Enum.filter(live, & &1.tank_id), & &1.tank_id),
        [a, b] <- pairs(Enum.sort_by(parts, &{Date.to_gregorian_days(&1.start), &1.id})),
        a.batch_id != b.batch_id,
        a_end = Parts.occupied_until(a),
        b_end = Parts.occupied_until(b),
        Date.compare(b.start, a_end) == :lt and Date.compare(a.start, b_end) == :lt do
      flag(:tank_overlap, [a.id, b.id], [tank_id, a.start, a_end, b.start, b_end],
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
        [
          tank.id,
          p.volume,
          tank.capacity_bbl,
          (p.fill && p.fill.due_on) || p.start,
          (p.exit && p.exit.due_on) || p.end
        ],
        message:
          "#{Parts.label(p)} (#{bbl(p.volume)}) is bigger than #{tank.name} (#{bbl(tank.capacity_bbl)}).",
        batch_ids: [p.batch_id],
        tank_id: tank.id
      )
    end
  end

  # A planned fill into a tank whose previous part's CIP comes after it or
  # is missing, with no standalone CIP or clean mark (D48) in between.
  defp dirty_fills(live, by_tank, cips_by_tank, marks_by_tank, tanks) do
    for p <- live,
        p.tank_id && p.fill && is_nil(p.fill.done_on),
        prev = previous(by_tank[p.tank_id], p),
        prev,
        # D48: a split part that stays is the same beer: the Split that ends
        # the parent's stay is what fills it.
        not (prev.exit != nil and prev.exit.id == p.fill.id),
        # D48 DEV QA R4: the same batch coming back before it left is about
        # its transfers' order (`transfer_order`), not cleaning.
        not (prev.batch_id == p.batch_id and prev.exit != nil and
               Date.compare(p.fill.due_on, prev.exit.due_on) != :gt),
        # A generator, not `prev_cip = …`: in `for` a binding is also a
        # filter, and a missing CIP (nil) would drop the flag. A Sanitize
        # doesn't clean (D49).
        prev_cip <- [prev |> cleaning_cips() |> Enum.max_by(&Parts.order/1, fn -> nil end)],
        is_nil(prev_cip) or Date.compare(prev_cip.due_on, p.fill.due_on) == :gt,
        emptied = (prev.exit && prev.exit.due_on) || prev.end,
        not Enum.any?(
          Map.get(cips_by_tank, p.tank_id, []),
          &(Parts.cleans?(&1) and Date.compare(&1.due_on, emptied) != :lt and
              Date.compare(&1.due_on, p.fill.due_on) != :gt)
        ),
        not Enum.any?(
          Map.get(marks_by_tank, p.tank_id, []),
          &(&1.state in ["clean", "cleaned"] and Date.compare(&1.marked_on, emptied) != :lt and
              Date.compare(&1.marked_on, p.fill.due_on) != :gt)
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

  # D48: a planned fill into a tank that was last marked dirty (the latest
  # of its done exits, done CIPs and marks before the fill is a dirty mark),
  # with no CIP planned or done between the mark and the fill.
  defp marked_dirty_fills(live, by_tank, cips_by_tank, marks_by_tank, tanks) do
    for p <- live,
        p.tank_id && p.fill && is_nil(p.fill.done_on),
        marks = Map.get(marks_by_tank, p.tank_id, []),
        marks != [],
        parts = Map.get(by_tank, p.tank_id, []),
        cips = Map.get(cips_by_tank, p.tank_id, []),
        %{source: :mark, state: :dirty, mark: m} <- [
          parts
          |> Parts.condition_events(cips, marks)
          |> Enum.filter(&(Date.compare(&1.on, p.fill.due_on) != :gt))
          |> Parts.latest_condition()
        ],
        not Enum.any?(
          Enum.flat_map(Enum.reject(parts, &(&1.id == p.id)), &cleaning_cips/1) ++
            Enum.filter(cips, &Parts.cleans?/1),
          &(planned_after?(&1, m) and Date.compare(&1.due_on, p.fill.due_on) != :gt)
        ) do
      flag(:dirty_fill, [p.id, "mark#{m.id}"], [p.tank_id, p.fill.due_on, m.marked_on],
        message:
          "#{Parts.label(p)} fills #{tanks[p.tank_id].name}, which was marked dirty on #{Calendar.strftime(m.marked_on, "%b %-d")}.",
        batch_ids: [p.batch_id],
        tank_id: p.tank_id
      )
    end
  end

  # D49 §3.12a: a planned fill into a tank that's clean but not sanitized
  # by then: what's done and what's planned in the tank before the fill, as
  # one timeline (`Parts.condition_events/4`), ends cleaned. A dirty end is
  # the dirty flags' (they don't both show).
  defp unsanitized_fills(live, by_tank, cips_by_tank, marks_by_tank, tanks) do
    for p <- live,
        p.tank_id && p.fill && is_nil(p.fill.done_on),
        others = Enum.reject(Map.get(by_tank, p.tank_id, []), &(&1.id == p.id)),
        %{state: :cleaned} = e <- [
          others
          |> Parts.condition_events(
            Map.get(cips_by_tank, p.tank_id, []),
            Map.get(marks_by_tank, p.tank_id, []),
            planned: true
          )
          |> Enum.filter(&(Date.compare(&1.on, p.fill.due_on) != :gt))
          |> Parts.latest_condition()
        ] do
      flag(:unsanitized_fill, [p.id], [p.tank_id, p.fill.due_on, e.on],
        message: "#{Parts.label(p)} fills #{tanks[p.tank_id].name}, which isn't sanitized.",
        batch_ids: [p.batch_id],
        tank_id: p.tank_id
      )
    end
  end

  # "CIP & Sanitize", "CIP - no sani" or "Sanitize" (D49).
  defp cip_label(c),
    do: RockcutApi.Production.cip_name("CIP & Sanitize", Steps.cip_method(c))

  defp cleaning_cips(part), do: part |> Parts.own_cips() |> Enum.filter(&Parts.cleans?/1)

  # A CIP still to come on or after a dirty mark's day. A done one is in the
  # timeline already, and the mark (the latest) came after it, also on the
  # same day (D49 QA 2: by time, as the status reads it).
  defp planned_after?(cip, mark),
    do: is_nil(cip.done_on) and Date.compare(cip.due_on, mark.marked_on) != :lt

  # A tank's last emptying with no CIP dated on or after it, unless a clean
  # mark (D48) came after it.
  defp dirty_no_cip(by_tank, cips_by_tank, marks_by_tank, tanks) do
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
            cleaning_cips(last) ++ Map.get(cips_by_tank, tank_id, []),
            &Parts.cleans?/1
          ),
        not Enum.any?(cips, &(Date.compare(&1.due_on, emptied) != :lt)),
        match?(
          %{state: :dirty},
          Parts.latest_condition(
            Parts.condition_events(
              parts,
              Map.get(cips_by_tank, tank_id, []),
              Map.get(marks_by_tank, tank_id, [])
            )
          )
        ) do
      flag(:dirty_no_cip, [tank_id, last.id], [tank_id, emptied],
        message: "#{tank.name} was emptied (#{last.label}) and has no CIP planned.",
        batch_ids: [last.batch_id],
        tank_id: tank_id
      )
    end
  end

  # D48: a tank whose latest state is a dirty mark, with nothing filled
  # since and no CIP dated on or after the mark.
  defp marked_dirty_no_cip(by_tank, cips_by_tank, marks_by_tank, tanks) do
    for {tank_id, marks} <- marks_by_tank,
        tank = tanks[tank_id],
        tank,
        parts = Map.get(by_tank, tank_id, []),
        cips = Map.get(cips_by_tank, tank_id, []),
        %{source: :mark, state: :dirty, mark: m} <- [
          Parts.latest_condition(Parts.condition_events(parts, cips, marks))
        ],
        not Enum.any?(
          parts,
          &(Parts.filled?(&1) and Date.compare(&1.fill.done_on, m.marked_on) != :lt)
        ),
        not Enum.any?(
          Enum.flat_map(Enum.filter(parts, &Parts.filled?/1), &cleaning_cips/1) ++
            Enum.filter(cips, &Parts.cleans?/1),
          &planned_after?(&1, m)
        ) do
      flag(:dirty_no_cip, [tank_id, "mark#{m.id}"], [tank_id, m.marked_on],
        message: "#{tank.name} was marked dirty and has no CIP planned.",
        batch_ids: [],
        tank_id: tank_id
      )
    end
  end

  # A step dated before a step it follows, unless both are done: the same
  # rule as the move prompt's warning (`Steps.out_of_order?/2`).
  defp out_of_order(parts) do
    for {_batch_id, [p | _]} <- Enum.group_by(parts, & &1.batch_id),
        by_id = Map.new(p.batch_steps, &{&1.id, &1}),
        l <- p.links,
        from = by_id[l.from_step_id],
        to = by_id[l.to_step_id],
        from && to && RockcutApi.Production.Steps.out_of_order?(from, to) do
      flag(:out_of_order, [l.id], [from.due_on, to.due_on],
        message:
          "#{p.label}: #{RockcutApi.Production.Steps.name(to)} is before #{RockcutApi.Production.Steps.name(from)}, the step it follows.",
        batch_ids: [p.batch_id],
        tank_id: nil
      )
    end ++ split_order(parts)
  end

  # D48 DEV QA Y1: a split part's first steps follow its parent's Split
  # (`Parts.split_links/3`), checked by the same rule.
  defp split_order(parts) do
    for {_batch_id, mine} <- Enum.group_by(parts, & &1.batch_id),
        p = Enum.find(mine, &(&1.vessel_index == 0)),
        split = p && p.fill,
        split && Parts.behavior(split) == "split" && split.batch_id != p.batch_id,
        l <- Parts.split_links(split, p.batch_steps, p.links),
        to = Enum.find(p.batch_steps, &(&1.id == l.to_step_id)),
        RockcutApi.Production.Steps.out_of_order?(split, to) do
      flag(:out_of_order, ["split#{split.id}", to.id], [split.due_on, to.due_on],
        message:
          "#{p.label}: #{RockcutApi.Production.Steps.name(to)} is before #{RockcutApi.Production.Steps.name(split)}, the step it follows.",
        batch_ids: [p.batch_id, split.batch_id],
        tank_id: nil
      )
    end
  end

  # D48 DEV QA R4: a batch's transfers out of date order (a Move only can
  # do it): the Transfer/Filter into vessel k + 1 dated on or before the one
  # into k, unless both are done. Named by the earlier-dated one, with the
  # tank the beer is in by then when it's the same.
  defp transfer_order(parts, tanks) do
    for {_batch_id, [p | _] = mine} <- Enum.group_by(parts, & &1.batch_id),
        tank_of = Map.new(mine, &{&1.vessel_index, &1.tank_id}),
        transfers = Enum.filter(p.batch_steps, &(Parts.behavior(&1) == "transfer")),
        fills =
          transfers
          |> Enum.group_by(& &1.vessel_index)
          |> Map.new(fn {k, ts} -> {k, Enum.min_by(ts, &Parts.order/1)} end),
        {k, a} <- Enum.sort(fills),
        b = fills[k + 1],
        b,
        not (Parts.done?(a) and Parts.done?(b)),
        Date.compare(b.due_on, a.due_on) != :gt do
      before = Enum.filter(transfers, &(&1.id != b.id and Parts.order(&1) < Parts.order(b)))
      here = before |> Enum.max_by(&Parts.order/1, fn -> %{vessel_index: 0} end)
      into = tank_of[k + 1]
      day = &Calendar.strftime(&1, "%a %b %-d")

      detail =
        if into != nil and tank_of[here.vessel_index] == into,
          do: "which it's already in",
          else:
            "before #{tank_name(tanks, tank_of[k])}" <>
              if(a.due_on == b.due_on, do: " that day", else: " on #{day.(a.due_on)}")

      flag(:transfer_order, [a.id, b.id], [a.due_on, b.due_on, tank_of[k], into],
        message:
          "#{p.label}'s transfers are out of order: on #{day.(b.due_on)} the beer goes into #{tank_name(tanks, into)}, #{detail}.",
        batch_ids: [p.batch_id],
        tank_id: into
      )
    end
  end

  defp tank_name(_tanks, nil), do: "Unassigned"
  defp tank_name(tanks, id), do: (tanks[id] && tanks[id].name) || "a retired tank"

  defp no_tank(live, today) do
    for p <- live,
        is_nil(p.tank_id) and p.fill != nil and is_nil(p.fill.done_on),
        not p.pencilled,
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
            "The #{cip_label(c)} in #{tank.name} on #{Calendar.strftime(c.due_on, "%b %-d")} is while it's out of service (#{period(o)}).",
          batch_ids: [],
          tank_id: tank.id
        )
      end

    part_flags ++ cip_flags
  end

  # A standalone CIP, planned or done, dated while a batch's beer is in the
  # tank (after its fill, before its exit).
  defp cip_with_beer(live, cips, tanks) do
    for c <- cips,
        p <- live,
        p.tank_id == c.tank_id,
        p.fill != nil,
        beer_until = (p.exit && p.exit.due_on) || p.end,
        Date.compare(c.due_on, p.fill.due_on) == :gt and Date.compare(c.due_on, beer_until) == :lt do
      flag(:cip_with_beer, ["cip#{c.id}", p.id], [c.due_on, p.fill.due_on, beer_until],
        message:
          "A #{cip_label(c)} in #{tanks[c.tank_id].name} on #{Calendar.strftime(c.due_on, "%b %-d")} while #{Parts.label(p)} is in it.",
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

  @doc """
  A short hash of what a flag is about: the recipe version (D48, see
  `@signature_version`), then its parts (ids, dates, decimals, nil), as one
  canonical string, `|`-joined, hashed. The same values give
  the same signature on every node and OTP version (`term_to_binary` bytes
  aren't guaranteed to; lead decisions 6): dates are ISO strings, decimals
  normalised ("30" and "30.0" agree).
  """
  def signature(parts) when is_list(parts) do
    :crypto.hash(:sha256, signature_string(parts))
    |> Base.encode16(case: :lower)
    |> binary_part(0, 16)
  end

  @doc "The canonical string a signature hashes: the recipe version (`v1`), then the parts, `|`-joined."
  def signature_string(parts) when is_list(parts),
    do: Enum.map_join([@signature_version | parts], "|", &canonical/1)

  defp canonical(nil), do: ""
  defp canonical(%Date{} = d), do: Date.to_iso8601(d)
  defp canonical(%Decimal{} = d), do: d |> Decimal.normalize() |> Decimal.to_string(:normal)
  defp canonical(n) when is_integer(n), do: Integer.to_string(n)
  defp canonical(s) when is_binary(s), do: s

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
