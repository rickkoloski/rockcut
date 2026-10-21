defmodule RockcutApi.Production.StatusFlagsTest do
  @moduledoc """
  D47 §3.8 tank status and §3.9 flags: the pure functions, on plain structs
  (no database).
  """
  use ExUnit.Case, async: true

  alias RockcutApi.Brewing.{Batch, Brand}

  alias RockcutApi.Production.{
    Flags,
    FlagSignoff,
    Outage,
    Parts,
    Step,
    StepLink,
    Steps,
    StepType,
    Tank,
    TankStatus
  }

  alias RockcutApi.Accounts.User

  @today ~D[2026-10-21]
  @phases %{1 => "Brew day", 3 => "Fermentation", 5 => "Crash", 9 => "Packaging"}

  defp type(b),
    do: %StepType{
      id: Enum.find_index(~w(plain brew set_temp transfer split cip package), &(&1 == b)) + 1,
      name: b,
      behavior: b
    }

  # A step: {id, behavior | :marker, offset from today, opts}.
  defp step(id, behavior, offset, opts \\ []) do
    %Step{
      id: id,
      batch_id: opts[:batch] || 1,
      step_type_id: if(behavior == :marker, do: nil, else: id),
      step_type: if(behavior == :marker, do: nil, else: type(behavior)),
      phase_id: opts[:phase],
      vessel_index: opts[:vessel] || 0,
      temperature: opts[:temp],
      package_partial: opts[:partial] || false,
      position: opts[:position] || 0,
      due_on: Date.add(@today, offset),
      done_on:
        if(opts[:done],
          do: Date.add(@today, if(opts[:done] == true, do: offset, else: opts[:done]))
        ),
      tank_id: opts[:tank]
    }
  end

  defp entry(id, label, steps, opts) do
    %{
      batch: %Batch{
        id: id,
        status: opts[:status] || "fermenting",
        volume_bbl: Decimal.new(opts[:volume] || 20),
        brand: %Brand{name: label}
      },
      label: label,
      vessels:
        Enum.map(opts[:tanks] || [10], fn
          {k, t} -> %{vessel_index: k, tank_id: t}
          t -> %{vessel_index: 0, tank_id: t}
        end),
      steps: steps,
      links: opts[:links] || []
    }
  end

  defp link(id, from, to, answer \\ "move_all"),
    do: %StepLink{id: id, from_step_id: from, to_step_id: to, default_answer: answer}

  defp tank(id, name, opts \\ []),
    do: %Tank{
      id: id,
      name: name,
      capacity_bbl: Decimal.new(opts[:capacity] || 20),
      outages: opts[:outages] || []
    }

  defp status(tank, entries, cips \\ []) do
    parts = entries |> Parts.build() |> Enum.filter(&(&1.tank_id == tank.id))
    TankStatus.for(tank, parts, cips, @today, @phases)
  end

  # Crusher #42 brewed 18 days ago at 68°, Fermentation from day 2, Set temp
  # 58° due today (P49).
  defp crusher(extra \\ []) do
    entry(
      1,
      "Crusher #42",
      [
        step(1, "brew", -18, done: true, temp: 68, phase: 1),
        step(2, :marker, -16, phase: 3),
        step(3, "plain", -11, done: true),
        step(4, "set_temp", 0, temp: 58, phase: 5),
        step(5, "package", 10, phase: 9),
        step(6, "cip", 10)
      ] ++ extra,
      links: [link(1, 1, 2), link(2, 1, 3), link(3, 3, 4), link(4, 4, 5), link(5, 5, 6)]
    )
  end

  describe "tank status (§3.8)" do
    test "beer in it: day, phase, temperature, set today (P49)" do
      s = status(tank(10, "FV4"), [crusher()])

      assert s == %{
               tank_id: 10,
               state: "in_use",
               line: "Day 18 · Fermentation · 68° · set to 58° today",
               alert: false,
               batch_id: 1,
               batch_label: "Crusher #42"
             }
    end

    test "a checked-off Set temp sets the temperature; a late one is red (P34, P50)" do
      done =
        crusher()
        |> put_in(
          [:steps],
          Enum.map(crusher().steps, fn s -> if s.id == 4, do: %{s | done_on: @today}, else: s end)
        )

      assert status(tank(10, "FV4"), [done]).line == "Day 18 · Crash · 58°"

      late =
        entry(
          2,
          "Galactic #41",
          [
            step(11, "brew", -22, done: true, temp: 66, batch: 2),
            step(12, "set_temp", -2, done: true, temp: 38, batch: 2),
            step(13, "set_temp", -1, temp: 32, batch: 2),
            step(14, "package", 5, batch: 2)
          ],
          tanks: [11]
        )

      assert %{line: "Day 22 · 38° · 32° change late", alert: true} =
               status(tank(11, "FV5"), [late])
    end

    test "a marker starts its phase only once its predecessors are done" do
      e = crusher()

      waiting = %{
        e
        | steps: Enum.map(e.steps, fn s -> if s.id == 1, do: s, else: s end),
          links: [link(9, 3, 2) | e.links]
      }

      # Marker 2 also follows step 3 (done) and step 1 (done): it starts.
      assert status(tank(10, "FV4"), [waiting]).line =~ "Fermentation"

      # A marker after a marker that has started starts too (Lag, then Fermentation).
      lag = step(8, :marker, -17, phase: 2)

      chained = %{
        e
        | steps: [lag | e.steps],
          links: [link(10, 1, 8), link(11, 8, 2) | tl(e.links)]
      }

      assert status(tank(10, "FV4"), [chained]).line =~ "Fermentation"

      blocked = %{e | links: [link(9, 4, 2) | e.links]}
      # Now it follows the Set temp, not done: no phase but the brew day's.
      assert status(tank(10, "FV4"), [blocked]).line ==
               "Day 18 · Brew day · 68° · set to 58° today"
    end

    test "out of service today, with the batch still named" do
      o = %Outage{
        id: 1,
        starts_on: Date.add(@today, -1),
        ends_on: ~D[2026-10-30],
        reason: "Gasket"
      }

      s = status(tank(10, "FV4", outages: [o]), [crusher()])

      assert {s.state, s.line, s.batch_label} ==
               {"out", "Out of service · Gasket · through Oct 30", "Crusher #42"}

      open = %Outage{id: 2, starts_on: @today, ends_on: nil, reason: nil}
      assert status(tank(10, "FV4", outages: [open]), []).line == "Out of service"
    end

    defp emptied(cip_offset, cip_done) do
      entry(
        3,
        "Crusher #43",
        [
          step(21, "brew", -40, done: true, batch: 3),
          step(22, "package", -8, done: true, batch: 3)
        ] ++
          if(cip_offset, do: [step(23, "cip", cip_offset, done: cip_done, batch: 3)], else: []),
        status: "completed",
        tanks: [12]
      )
    end

    test "emptied: dirty with no CIP, dirty with one planned, then Sani (P51, P52)" do
      s1 = tank(12, "Serving 1")

      assert %{state: "dirty", line: "Empty · dirty 8 days · no CIP planned", alert: true} =
               status(s1, [emptied(nil, false)])

      assert %{state: "dirty", line: "Empty · dirty 8 days", alert: false} =
               status(s1, [emptied(2, false)])

      assert %{state: "sani", line: "Sani 6 days"} = status(s1, [emptied(-6, true)])

      # A standalone CIP done today cleans it.
      cip = step(99, "cip", 0, done: true, batch: nil, tank: 12) |> Map.put(:batch_id, nil)
      assert %{state: "sani", line: "Sani 0 days"} = status(s1, [emptied(nil, false)], [cip])

      # A CIP on the exit's own day cleans after it (N4).
      assert %{state: "sani", line: "Sani 8 days"} = status(s1, [emptied(-8, true)])

      emptied_today = %{
        emptied(nil, false)
        | steps: [
            step(21, "brew", -40, done: true, batch: 3),
            step(22, "package", 0, done: true, batch: 3)
          ]
      }

      assert %{state: "sani", line: "Sani 0 days"} = status(s1, [emptied_today], [cip])
    end

    test "never used: Empty · clean; a partial Package doesn't empty it (P112)" do
      assert %{state: "clean", line: "Empty · clean", batch_id: nil} = status(tank(13, "FV6"), [])

      partial = crusher([step(7, "package", -1, done: true, partial: true)])
      assert %{state: "in_use", batch_label: "Crusher #42"} = status(tank(10, "FV4"), [partial])
    end
  end

  describe "flags (§3.9)" do
    defp flags(entries, opts \\ []) do
      world = %{
        parts: Parts.build(entries),
        cips: opts[:cips] || [],
        tanks: opts[:tanks] || [tank(10, "FV2"), tank(11, "FV6", capacity: 20)],
        today: @today
      }

      Flags.compute(world, opts[:signoffs] || [])
    end

    defp kinds(flags), do: flags |> Enum.map(& &1.kind) |> Enum.sort()

    # Galactic #40 in FV2 until its CIP in 10 days.
    defp galactic do
      entry(
        1,
        "Galactic #40",
        [
          step(1, "brew", -10, done: true),
          step(2, "package", 10),
          step(3, "cip", 10)
        ],
        links: [link(1, 1, 2), link(2, 2, 3)]
      )
    end

    defp planned(id, label, brew_offset, opts \\ []) do
      b = id * 10

      entry(
        id,
        label,
        [
          step(b + 1, "brew", brew_offset, batch: id),
          step(b + 2, "package", brew_offset + 20, batch: id),
          step(b + 3, "cip", brew_offset + 20, batch: id)
        ],
        Keyword.merge(
          [
            status: "planned",
            tanks: [10],
            links: [link(b + 1, b + 1, b + 2), link(b + 2, b + 2, b + 3)]
          ],
          opts
        )
      )
    end

    test "planned into FV2 the day before Galactic's CIP: overlap and dirty fill (P53)" do
      f = flags([galactic(), planned(2, "Altruism P1", 9)])
      assert kinds(f) == ["dirty_fill", "tank_overlap"]
      overlap = Enum.find(f, &(&1.kind == "tank_overlap"))
      assert overlap.key == "tank_overlap:1.0:2.0"
      assert overlap.message == "Galactic #40 and Altruism P1 overlap in FV2."
      assert overlap.batch_ids == [1, 2]

      # The batch before has no CIP at all: still a dirty fill.
      no_cip = %{galactic() | steps: Enum.reject(galactic().steps, &(&1.id == 3))}
      assert "dirty_fill" in kinds(flags([no_cip, planned(2, "Altruism P1", 12)]))

      # Filling on the CIP day is normal.
      assert flags([galactic(), planned(2, "Altruism P1", 10)]) == []
    end

    test "bigger than the tank (P54), no tank near its fill (P33), out of order" do
      assert [%{kind: "too_big", message: "Altruism P1 (30 bbl) is bigger than FV2 (20 bbl)."}] =
               flags([planned(2, "Altruism P1", 30, volume: 30)])

      assert [%{kind: "no_tank", key: "no_tank:2.0"}] =
               flags([planned(2, "Enos P2", 3, tanks: [nil])])

      assert flags([planned(2, "Enos P2", 4, tanks: [nil])]) == []

      e = planned(2, "Fest P1", 30)

      backwards = %{
        e
        | steps:
            Enum.map(e.steps, fn s ->
              if s.id == 22, do: %{s | due_on: Date.add(@today, 25)}, else: s
            end),
          links: [link(7, 21, 22) | tl(e.links) |> Enum.map(& &1)] ++ [link(8, 23, 22)]
      }

      assert ["out_of_order"] = backwards |> List.wrap() |> flags() |> kinds() |> Enum.uniq()
    end

    test "emptied with no CIP after it; a planned or standalone CIP clears it (P51, P52)" do
      empty =
        entry(
          3,
          "Crusher #43",
          [
            step(31, "brew", -40, done: true, batch: 3),
            step(32, "package", -8, done: true, batch: 3)
          ],
          status: "completed",
          tanks: [11]
        )

      assert [
               %{
                 kind: "dirty_no_cip",
                 message: "FV6 was emptied (Crusher #43) and has no CIP planned."
               }
             ] = flags([empty])

      cip = %{step(99, "cip", 0, done: true, tank: 11) | batch_id: nil}
      assert flags([empty], cips: [cip]) == []
    end

    test "out of service and a CIP while the beer is in the tank (P6, P58)" do
      o = %Outage{
        id: 5,
        starts_on: Date.add(@today, 5),
        ends_on: Date.add(@today, 7),
        reason: "Gasket"
      }

      tanks = [tank(10, "FV2", outages: [o]), tank(11, "FV6")]

      assert [%{kind: "out_of_service", key: "out_of_service:1.0:5"}] =
               flags([galactic()], tanks: tanks)

      cip = %{step(99, "cip", 2, tank: 10) | batch_id: nil}

      assert [%{kind: "cip_with_beer", key: "cip_with_beer:cip99:1.0"}] =
               flags([galactic()], cips: [cip])
    end

    # Fest #44 in FV2: Carb in 2 days, then a full Package in 5 and its CIP
    # in 6; the Package was checked off early, today (M3).
    defp packaged_early(opts \\ []) do
      entry(
        4,
        "Fest #44",
        [
          step(41, "brew", -20, done: true, batch: 4),
          step(42, "plain", 2, batch: 4),
          step(43, "package", 0, done: true, batch: 4),
          step(44, "cip", opts[:cip] || 6, batch: 4, done: opts[:cip_done])
        ],
        status: "completed",
        links: [link(41, 41, 42), link(42, 42, 43), link(43, 43, 44)]
      )
    end

    test "a done step before an unfinished step it follows is out of order (M3)" do
      assert [%{kind: "out_of_order", key: "out_of_order:42", batch_ids: [4]}] =
               flags([packaged_early()])

      # The same rule as the move prompt's warning; both done isn't flagged.
      [carb, pkg] = Enum.filter(packaged_early().steps, &(&1.id in [42, 43]))
      assert Steps.out_of_order?(carb, pkg)
      refute Steps.out_of_order?(%{carb | done_on: @today}, pkg)
      refute Steps.out_of_order?(pkg, carb)

      # Still flagged once the part is finished (its CIP done too).
      assert ["out_of_order"] = kinds(flags([packaged_early(cip: 0, cip_done: 0)]))
    end

    test "a done exit ends the stay there; its CIP is a leftover; later steps are stranded (M3, N4)" do
      [part] = Parts.build([packaged_early()])
      assert part.end == @today
      assert part.leftover_cip.id == 44
      assert Enum.map(part.stranded, & &1.id) == [42]
      assert Parts.occupied_until(part) == @today

      [done_cip] = Parts.build([packaged_early(cip: 1, cip_done: 1)])
      assert done_cip.end == @today

      [planned] = Parts.build([galactic()])
      assert planned.end == Date.add(@today, 10)
      assert planned.stranded == []
      assert planned.leftover_cip == nil
      assert Parts.occupied_until(planned) == Date.add(@today, 10)
    end

    test "after a done exit the tank is held to the exit: dirty, no overlap; the leftover CIP in the next stay is flagged (M3, N4)" do
      next = planned(5, "Altruism P1", 3)
      without_carb = fn e -> %{e | steps: Enum.reject(e.steps, &(&1.id == 42)), links: []} end
      done = without_carb.(packaged_early())

      # Its own CIP (day 6) is after the next fill (day 3): dirty, not
      # overlapping; and that CIP falls in the next batch's stay.
      f = flags([done, next])
      assert kinds(f) == ["cip_with_beer", "dirty_fill"]

      assert Enum.find(f, &(&1.kind == "cip_with_beer")).message ==
               "A CIP & Sanitize in FV2 on #{Calendar.strftime(Date.add(@today, 6), "%b %-d")} while Altruism P1 is in it."

      # A done standalone CIP in between cleaned it: only the leftover CIP's flag.
      cip = %{step(98, "cip", 1, done: true, tank: 10) | batch_id: nil}
      assert kinds(flags([done, next], cips: [cip])) == ["cip_with_beer"]

      # The leftover CIP on the exit day: cleaning after it, nothing at all.
      same_day = without_carb.(packaged_early(cip: 0))
      assert flags([same_day, next]) == []

      # Not yet emptied, the same dates overlap.
      not_done = %{
        done
        | steps: Enum.map(done.steps, &%{&1 | done_on: if(&1.id == 41, do: &1.done_on)})
      }

      assert "tank_overlap" in kinds(flags([not_done, next]))
    end

    test "a done standalone CIP while the beer is in the tank is flagged too (minor 10)" do
      cip = %{step(97, "cip", -2, done: true, tank: 10) | batch_id: nil}

      assert [%{kind: "cip_with_beer", key: "cip_with_beer:cip97:1.0"}] =
               flags([galactic()], cips: [cip])
    end

    test "moving a batch bigger than its tank reopens the sign-off (minor 1)" do
      [flag] = flags([planned(2, "Altruism P1", 30, volume: 30)])
      [moved] = flags([planned(2, "Altruism P1", 31, volume: 30)])
      assert moved.key == flag.key
      refute moved.signature == flag.signature
    end

    test "sign-off holds for the same signature; a change reopens it (P55, P56)" do
      [flag] = flags([planned(2, "Enos P2", 3, tanks: [nil])])

      signoff = %FlagSignoff{
        flag_key: flag.key,
        signature: flag.signature,
        note: "Tank decided on brew morning.",
        user_id: 7,
        user: %User{name: "Jake Brewer"},
        signed_at: ~U[2026-10-20 12:00:00Z]
      }

      [signed] = flags([planned(2, "Enos P2", 3, tanks: [nil])], signoffs: [signoff])
      assert {signed.signed_off, signed.was_signed_off} == {true, false}
      assert signed.signoff.user_name == "Jake Brewer"

      [moved] = flags([planned(2, "Enos P2", 2, tanks: [nil])], signoffs: [signoff])
      assert moved.key == flag.key
      assert {moved.signed_off, moved.was_signed_off} == {false, true}
    end
  end
end
