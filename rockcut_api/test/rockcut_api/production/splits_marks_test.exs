defmodule RockcutApi.Production.SplitsMarksTest do
  @moduledoc """
  D48 task 2: splits and Undo split (§3.11, P75–P82, P89, P110), part
  numbering, clean / dirty marks (§3.8, P114–P117) with their effect on
  tank status and flags, and Undo of all of it.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Brewing.Batch

  alias RockcutApi.Production.{
    Batches,
    ConditionMarks,
    Parts,
    Schedule,
    Splits,
    Step,
    Steps,
    Undo
  }

  # Brew Nov 2: FDH Nov 9, Set temp 58° Nov 12, Carb Nov 16, Package and CIP Nov 22.
  @brew ~D[2026-11-02]
  @today ~D[2026-10-21]

  setup do
    fv2 = tank!("FV2")
    fv6 = tank!("FV6")
    batch = plan!(brand!("Galactic"), ale_template!(), @brew, %{"tank_ids" => [fv2.id]})
    %{fv2: fv2, fv6: fv6, batch: batch, brewer: user_with_role("employee", "brewery")}
  end

  defp split(batch, parts, extra \\ %{}) do
    Splits.split(reload(batch), Map.merge(%{"due_on" => "2026-11-13", "parts" => parts}, extra))
  end

  defp stays(v), do: %{"stays" => true, "volume_bbl" => v}
  defp into(tank, v), do: %{"tank_id" => tank.id, "volume_bbl" => v}

  defp parts(batch), do: Splits.parts_of(batch)

  defp label(batch) do
    [entry] = Schedule.batches([batch.id])
    entry.label
  end

  defp schedule(today \\ @today) do
    {:ok, s} = Schedule.load(Date.add(today, -30), Date.add(today, 60), today)
    s
  end

  defp status(sched, tank), do: Enum.find(sched.statuses, &(&1.tank_id == tank.id))

  describe "split" do
    test "#40.1 stays in FV2, #40.2 to FV6: own steps, no CIP for FV2 (P75)", ctx do
      assert {:ok, %{part_ids: [p1, p2]}} =
               split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])

      assert layout(ctx.batch) == [
               {"Brew day", @brew, 0},
               {"FDH", ~D[2026-11-09], 0},
               {"Set temp - 58°", ~D[2026-11-12], 0},
               {"Split - Transfer", ~D[2026-11-13], 0}
             ]

      assert {"Set temp - 58°", "Split - Transfer", "move_all"} in links(ctx.batch)
      [one, two] = [Repo.get!(Batch, p1), Repo.get!(Batch, p2)]
      assert {one.part_number, two.part_number} == {1, 2}
      assert Decimal.equal?(one.volume_bbl, 12) and Decimal.equal?(two.volume_bbl, 8)
      assert one.brand_id == ctx.batch.brand_id and one.status == "planned"
      assert is_nil(one.batch_number)

      for part <- [one, two] do
        assert layout(part) == [
                 {"Carb", ~D[2026-11-16], 0},
                 {"Package", ~D[2026-11-22], 0},
                 {"CIP & Sanitize", ~D[2026-11-22], 0}
               ]

        assert links(part) == [
                 {"Carb", "Package", "move_only"},
                 {"Package", "CIP & Sanitize", "move_all"}
               ]
      end

      assert vessels(one) == %{0 => ctx.fv2.id}
      assert vessels(two) == %{0 => ctx.fv6.id}

      # Labels follow the parent's P-number; parts take no P-number of their own.
      assert label(one) == "Galactic P1.1"
      assert label(two) == "Galactic P1.2"
      assert Batches.p_numbers() |> Map.keys() == [ctx.batch.id]

      # The parent's stay ends at the Split; part 1 fills FV2 that day: no overlap.
      sched = schedule()
      by_id = Map.new(Parts.build(Schedule.batches([ctx.batch.id, p1, p2])), &{&1.id, &1})
      assert by_id["#{ctx.batch.id}.0"].exit.due_on == ~D[2026-11-13]
      assert by_id["#{p1}.0"].fill.due_on == ~D[2026-11-13]
      assert by_id["#{p1}.0"].start == ~D[2026-11-13]
      refute Enum.any?(sched.flags, &(&1.kind in ~w(tank_overlap dirty_fill)))
    end

    test "refusals: volumes (P76), same tank (P77), two staying, one part, a part, twice", ctx do
      assert {:error, {:volumes_must_add_up, total, vol, "Galactic P1"}} =
               split(ctx.batch, [stays("12"), into(ctx.fv6, "6")])

      assert Decimal.equal?(total, 18) and Decimal.equal?(vol, 20)
      assert {:error, :same_tank} = split(ctx.batch, [into(ctx.fv6, "12"), into(ctx.fv6, "8")])
      assert {:error, :one_stays} = split(ctx.batch, [stays("12"), stays("8")])
      # Going into the tank the beer is in is staying.
      # "(stays here)" is the only way to stay (DEV QA M3).
      assert {:error, {:same_tank, "FV2"}} = split(ctx.batch, [stays("12"), into(ctx.fv2, "8")])

      assert {:error, {:same_tank, "FV2"}} =
               split(ctx.batch, [into(ctx.fv2, "12"), into(ctx.fv6, "8")])

      assert {:error, :parts_required} = split(ctx.batch, [stays("20")])

      assert {:error, :split_before_brew} =
               split(ctx.batch, [stays("12"), into(ctx.fv6, "8")], %{"due_on" => "2026-11-02"})

      assert {:error, :split_method_invalid} =
               split(ctx.batch, [stays("12"), into(ctx.fv6, "8")], %{"split_method" => "pour"})

      assert parts(ctx.batch) == []

      {:ok, %{part_ids: [p1, _]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
      assert {:error, :split} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])

      assert {:error, :split_part} =
               split(Repo.get!(Batch, p1), [stays("6"), into(tank!("FV7"), "6")])

      assert {:error, :split_part} = Batches.delete_planned(Repo.get!(Batch, p1))

      assert {:error, :split_fill} =
               RockcutApi.Production.BatchChanges.remove_step(
                 named(ctx.batch, "Split - Transfer")
               )
    end

    test "no part stays: a CIP for FV2 on the split day (P78); Split - Filter (P110)", ctx do
      fv7 = tank!("FV7")

      {:ok, _} =
        split(ctx.batch, [into(ctx.fv6, "12"), into(fv7, "8")], %{"split_method" => "filter"})

      assert layout(ctx.batch) |> Enum.take(-2) == [
               {"Split - Filter", ~D[2026-11-13], 0},
               {"CIP & Sanitize", ~D[2026-11-13], 0}
             ]

      assert {"Split - Filter", "CIP & Sanitize", "move_all"} in links(ctx.batch)
    end

    test "a later tank: the part that stays keeps it, the other's starts Unassigned", ctx do
      bbt = tank!("BBT1")

      batch =
        plan!(brand!("Fest"), lager_template!(), @brew, %{
          "tank_ids" => [ctx.fv2.id, bbt.id],
          "volume_bbl" => "20"
        })

      fv7 = tank!("FV7")

      {:ok, %{part_ids: [p1, p2]}} =
        split(batch, [into(fv7, "8"), stays("12")], %{"due_on" => "2026-11-05"})

      assert vessels(batch) == %{0 => ctx.fv2.id}
      assert vessels(Repo.get!(Batch, p1)) == %{0 => fv7.id, 1 => nil}
      assert vessels(Repo.get!(Batch, p2)) == %{0 => ctx.fv2.id, 1 => bbt.id}

      assert layout(Repo.get!(Batch, p2)) == [
               {"Transfer", ~D[2026-11-12], 1},
               {"CIP & Sanitize", ~D[2026-11-12], 0},
               {"Package", ~D[2026-11-22], 1},
               {"CIP & Sanitize", ~D[2026-11-22], 1}
             ]
    end

    test "a part doesn't fill the tank its steps go into next; a part's own transfer either (DEV QA N1)",
         ctx do
      bbt = tank!("BBT1")
      fv7 = tank!("FV7")

      batch =
        plan!(brand!("Fest"), lager_template!(), @brew, %{
          "tank_ids" => [ctx.fv2.id, bbt.id],
          "volume_bbl" => "20"
        })

      # No part stays, so part 1 keeps the later tank (BBT1); the refusal
      # names it (DEV QA R3).
      assert {:error, {:part, 1, {:same_tank, "BBT1", ~D[2026-11-12]}}} =
               split(batch, [into(bbt, "8"), into(fv7, "12")], %{"due_on" => "2026-11-05"})

      assert parts(batch) == []
      assert vessels(batch) == %{0 => ctx.fv2.id, 1 => bbt.id}

      # Part 2's later tank starts Unassigned, which never matches.
      {:ok, %{part_ids: [p1, p2]}} =
        split(batch, [into(fv7, "8"), into(bbt, "12")], %{"due_on" => "2026-11-05"})

      assert vessels(Repo.get!(Batch, p1)) == %{0 => fv7.id, 1 => bbt.id}
      assert vessels(Repo.get!(Batch, p2)) == %{0 => bbt.id, 1 => nil}

      assert {:error, {:same_tank, "BBT1", ~D[2026-11-12]}} =
               RockcutApi.Production.BatchChanges.add_transfer(Repo.get!(Batch, p1), %{
                 "due_on" => "2026-11-08",
                 "tank_id" => bbt.id
               })
    end

    test "a part's volume is locked; its steps start on the split day (DEV QA N3, N4)", ctx do
      {:ok, %{part_ids: [_, p2]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
      part = Repo.get!(Batch, p2)
      assert {:error, :split} = Batches.update(part, %{"volume_bbl" => "9"})

      add =
        &RockcutApi.Production.BatchChanges.add_step(part, %{"name" => "Check", "due_on" => &1})

      assert {:error, :before_split} = add.("2026-11-12")
      assert {:ok, _} = add.("2026-11-13")

      assert {:error, :before_split} =
               RockcutApi.Production.BatchChanges.add_ramp(part, %{
                 "start" => 60,
                 "target" => 50,
                 "change_per_day" => 10,
                 "first_on" => "2026-11-12"
               })
    end

    test "parts move on their own (P79)", ctx do
      {:ok, %{part_ids: [p1, p2]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
      carb2 = named(Repo.get!(Batch, p2), "Carb")
      {:ok, _} = Steps.move([carb2.id], 2, answer: "move_all")
      assert named(Repo.get!(Batch, p1), "Carb").due_on == ~D[2026-11-16]
      assert named(Repo.get!(Batch, p2), "Package").due_on == ~D[2026-11-24]
    end

    test "brew day numbers the parts; the Split's check-off fills them (P82)", ctx do
      {:ok, %{part_ids: [p1, p2]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])

      {:ok, _} =
        Steps.complete(named(ctx.batch, "Brew day").id, %{"batch_number" => "45"}, ctx.brewer,
          today: @brew
        )

      assert label(Repo.get!(Batch, p1)) == "Galactic #45.1"
      assert Repo.get!(Batch, p2).status == "planned"

      {:ok, _} =
        Steps.complete(named(ctx.batch, "Set temp - 58°").id, %{}, ctx.brewer,
          today: ~D[2026-11-12]
        )

      split_step = named(ctx.batch, "Split - Transfer")
      {:ok, _} = Steps.complete(split_step.id, %{}, ctx.brewer, today: ~D[2026-11-13])
      assert reload(ctx.batch).status == "completed"
      assert Enum.map(parts(ctx.batch), & &1.status) == ["fermenting", "fermenting"]

      # FV2 holds part 1 now; FV6 part 2.
      sched = schedule(~D[2026-11-14])
      assert %{batch_label: "Galactic #45.1", state: "in_use"} = status(sched, ctx.fv2)
      assert %{batch_label: "Galactic #45.2"} = status(sched, ctx.fv6)
      # Its days, phase and temperature carry on from the parent.
      assert status(sched, ctx.fv2).line =~ ~r/^Day 12 · .*58°$/
      assert status(sched, ctx.fv6).line == status(sched, ctx.fv2).line

      {:ok, _} = Steps.uncomplete(split_step.id)
      assert reload(ctx.batch).status == "fermenting"
      assert Enum.map(parts(ctx.batch), & &1.status) == ["planned", "planned"]
    end
  end

  describe "undo split" do
    test "merges back with part 1's schedule (P80); refused once a part step is done (P81)",
         ctx do
      {:ok, %{part_ids: [p1, p2]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
      {:ok, _} = Steps.move([named(Repo.get!(Batch, p1), "Carb").id], 1, answer: "move_only")

      done = done!(named(Repo.get!(Batch, p2), "Carb"))
      assert {:error, :part_step_done} = Splits.undo_split(reload(ctx.batch))
      done |> Ecto.Changeset.change(done_on: nil) |> Repo.update!()

      # From a part, too.
      assert {:ok, %{batch_ids: [id]}} = Splits.undo_split(Repo.get!(Batch, p2))
      assert id == ctx.batch.id
      refute Repo.get(Batch, p1)
      refute Repo.get(Batch, p2)

      assert layout(ctx.batch) == [
               {"Brew day", @brew, 0},
               {"FDH", ~D[2026-11-09], 0},
               {"Set temp - 58°", ~D[2026-11-12], 0},
               {"Carb", ~D[2026-11-17], 0},
               {"Package", ~D[2026-11-22], 0},
               {"CIP & Sanitize", ~D[2026-11-22], 0}
             ]

      assert {"Set temp - 58°", "Carb", "move_all"} in links(ctx.batch)
      assert {"Carb", "Package", "move_only"} in links(ctx.batch)
      assert vessels(ctx.batch) == %{0 => ctx.fv2.id}
      assert {:error, :not_split} = Splits.undo_split(reload(ctx.batch))
    end

    test "with no part staying, the CIP it set up goes; later tanks come back", ctx do
      bbt = tank!("BBT1")

      batch =
        plan!(brand!("Fest"), lager_template!(), @brew, %{"tank_ids" => [ctx.fv2.id, bbt.id]})

      before = layout(batch)

      {:ok, _} =
        split(batch, [into(ctx.fv6, "12"), into(tank!("FV7"), "8")], %{"due_on" => "2026-11-05"})

      {:ok, _} = Splits.undo_split(reload(batch))
      assert layout(batch) == before
      assert vessels(batch) == %{0 => ctx.fv2.id, 1 => bbt.id}
    end

    test "Undo after a split puts it back as it was, and Undo of Undo split too (P89)", ctx do
      before = {layout(ctx.batch), links(ctx.batch)}

      {:ok, {%{part_ids: [p1, p2]}, token}} =
        Undo.track(ctx.brewer, %{batches: [ctx.batch.id]}, fn ->
          split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
        end)

      assert {:ok, %{batch_ids: ids}} = Undo.undo(ctx.brewer, token)
      assert ctx.batch.id in ids
      refute Repo.get(Batch, p1) || Repo.get(Batch, p2)
      assert {layout(ctx.batch), links(ctx.batch)} == before

      {:ok, %{part_ids: [q1, q2]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
      split_layout = layout(Repo.get!(Batch, q2))

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, %{batches: [ctx.batch.id]}, fn ->
          Splits.undo_split(reload(ctx.batch))
        end)

      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert Repo.get(Batch, q1) && layout(Repo.get!(Batch, q2)) == split_layout
      assert named(ctx.batch, "Split - Transfer")
    end

    test "a split parent can't be deleted, or its volume changed, until Undo split (DEV QA M2, minor 6)",
         ctx do
      {:ok, %{part_ids: [p1, _]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
      assert {:error, :split} = Batches.delete_planned(reload(ctx.batch))
      assert {:error, :split} = Batches.update(reload(ctx.batch), %{"volume_bbl" => "30"})
      assert Repo.get(Batch, p1)
      # After the package day the beer is gone: no split then.
      {:ok, _} = Splits.undo_split(reload(ctx.batch))

      assert {:error, :after_exit} =
               split(ctx.batch, [stays("12"), into(ctx.fv6, "8")], %{"due_on" => "2026-11-22"})
    end

    test "Undo of a delete puts back the batch with its vessels, steps, links and ramp (DEV QA M2)",
         ctx do
      {:ok, _} =
        RockcutApi.Production.BatchChanges.add_ramp(reload(ctx.batch), %{
          "start" => 60,
          "target" => 40,
          "change_per_day" => 10,
          "first_on" => "2026-11-13"
        })

      before = {layout(ctx.batch), links(ctx.batch), vessels(ctx.batch)}

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, %{batches: [ctx.batch.id]}, fn ->
          Batches.delete_planned(reload(ctx.batch))
        end)

      refute Repo.get(Batch, ctx.batch.id)
      assert {:ok, %{batch_ids: [_]}} = Undo.undo(ctx.brewer, token)
      assert {layout(ctx.batch), links(ctx.batch), vessels(ctx.batch)} == before
    end
  end

  describe "clean / dirty marks" do
    # Serving 1: Crusher #30 brewed in it Sep 20, packaged Oct 10, its CIP gone.
    setup ctx do
      s1 = tank!("Serving 1")

      old =
        plan!(brand!("Crusher"), ale_template!("Old ale"), ~D[2026-09-20], %{
          "tank_ids" => [s1.id]
        })

      for s <- steps_of(old),
          s.step_type && Date.compare(s.due_on, ~D[2026-10-10]) != :gt,
          do: done!(s)

      Repo.delete!(Enum.find(steps_of(old), &(&1.step_type && &1.step_type.behavior == "cip")))
      old |> Ecto.Changeset.change(status: "completed", batch_number: "30") |> Repo.update!()
      Map.merge(ctx, %{s1: s1, old: old})
    end

    defp mark(tank, state, day, ctx, note \\ nil) do
      ConditionMarks.create(
        tank,
        %{"state" => state, "marked_on" => day, "note" => note},
        ctx.brewer,
        @today
      )
    end

    defp dirty_flags(sched, tank),
      do:
        Enum.filter(
          sched.flags,
          &(&1.kind in ~w(dirty_no_cip dirty_fill) and &1.tank_id == tank.id)
        )

    test "Mark clean on a dirty tank: Sani 0 days, the dirty flag clears; Remove puts it back (P114, P117)",
         ctx do
      sched = schedule()
      assert status(sched, ctx.s1).line == "Empty · dirty 11 days · no CIP planned"
      assert [%{kind: "dirty_no_cip"}] = dirty_flags(sched, ctx.s1)

      {:ok, m} = mark(ctx.s1, "clean", @today, ctx, "  Hosed and sanitized after the gasket job ")
      assert m.note == "Hosed and sanitized after the gasket job"
      assert m.user.name == ctx.brewer.name
      sched = schedule()
      assert status(sched, ctx.s1).line == "Sani 0 days"
      assert dirty_flags(sched, ctx.s1) == []
      assert [%{id: id}] = Enum.filter(sched.marks, &(&1.tank_id == ctx.s1.id))
      assert id == m.id

      {:ok, _} = ConditionMarks.delete(m)
      assert status(schedule(), ctx.s1).line == "Empty · dirty 11 days · no CIP planned"
    end

    test "Mark dirty on a clean tank; a fill raises Filling a dirty tank; a CIP before it clears both (P115)",
         ctx do
      fv8 = tank!("FV8")
      {:ok, _} = mark(fv8, "dirty", Date.add(@today, -1), ctx)
      sched = schedule()
      assert %{line: "Empty · dirty 1 day · no CIP planned", alert: true} = status(sched, fv8)

      assert [%{kind: "dirty_no_cip", message: "FV8 was marked dirty and has no CIP planned."}] =
               dirty_flags(sched, fv8)

      plan!(brand!("Enos"), ale_template!("Ale 3"), ~D[2026-10-28], %{"tank_ids" => [fv8.id]})

      assert [
               %{
                 kind: "dirty_fill",
                 message: "Enos P1 fills FV8, which was marked dirty on Oct 20."
               }
             ] =
               schedule() |> dirty_flags(fv8) |> Enum.filter(&(&1.kind == "dirty_fill"))

      {:ok, _} =
        RockcutApi.Production.Cips.create(
          %{"tank_id" => fv8.id, "due_on" => "2026-10-27"},
          ctx.brewer,
          @today
        )

      sched = schedule()
      assert status(sched, fv8).line == "Empty · dirty 1 day"
      assert dirty_flags(sched, fv8) == []
    end

    test "refused with beer in the tank (P116), for a future day or one before the last emptying",
         ctx do
      fv1 = tank!("FV1")

      beer =
        plan!(brand!("Fest"), ale_template!("Ale 2"), ~D[2026-10-15], %{"tank_ids" => [fv1.id]})

      done!(named(beer, "Brew day"))
      assert {:error, :tank_in_use} = mark(fv1, "clean", @today, ctx)

      assert {:error, :date_invalid} = mark(ctx.s1, "clean", Date.add(@today, 1), ctx)
      assert {:error, :date_invalid} = mark(ctx.s1, "clean", ~D[2026-10-09], ctx)
      assert {:ok, _} = mark(ctx.s1, "clean", ~D[2026-10-10], ctx)
      assert {:error, %Ecto.Changeset{}} = mark(ctx.s1, "shiny", @today, ctx)

      assert {:error, %Ecto.Changeset{}} =
               mark(ctx.s1, "clean", @today, ctx, String.duplicate("x", 501))
    end

    test "the latest of exits, CIPs and marks wins; on one day the later recorded one", ctx do
      fv3 = tank!("FV3")
      {:ok, _} = mark(fv3, "dirty", ~D[2026-10-15], ctx)

      {:ok, cip} =
        RockcutApi.Production.Cips.create(
          %{"tank_id" => fv3.id, "due_on" => "2026-10-18", "already_done" => true},
          ctx.brewer,
          @today
        )

      assert status(schedule(), fv3).line == "Sani 3 days"

      {:ok, _} = mark(fv3, "dirty", ~D[2026-10-19], ctx)
      assert status(schedule(), fv3).line == "Empty · dirty 2 days · no CIP planned"

      # Same day as a later mark: the one recorded later counts.
      {:ok, _} = mark(fv3, "clean", ~D[2026-10-19], ctx)

      Repo.update_all(from(m in RockcutApi.Production.ConditionMark, where: m.state == "clean"),
        set: [inserted_at: ~U[2030-01-01 00:00:00Z]]
      )

      assert status(schedule(), fv3).line == "Sani 2 days"
      assert cip.done_on
    end

    test "Undo covers marks", ctx do
      {:ok, {m, token}} =
        Undo.track(
          ctx.brewer,
          %{},
          fn -> mark(ctx.s1, "clean", @today, ctx) end,
          &%{marks: [&1.id]}
        )

      {:ok, _} = Undo.undo(ctx.brewer, token)
      refute Repo.get(RockcutApi.Production.ConditionMark, m.id)

      {:ok, m} = mark(ctx.s1, "clean", @today, ctx)

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, %{marks: [m.id]}, fn -> ConditionMarks.delete(m) end)

      {:ok, _} = Undo.undo(ctx.brewer, token)
      assert Repo.get(RockcutApi.Production.ConditionMark, m.id)
    end
  end

  test "a step added to a part is unaffected by the parent's moves", ctx do
    {:ok, %{part_ids: [p1, _]}} = split(ctx.batch, [stays("12"), into(ctx.fv6, "8")])
    {:ok, _} = Steps.move([named(ctx.batch, "FDH").id], 1, answer: "move_all")
    assert named(Repo.get!(Batch, p1), "Carb").due_on == ~D[2026-11-16]
    assert %Step{} = named(ctx.batch, "Split - Transfer")
  end
end
