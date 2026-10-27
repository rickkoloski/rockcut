defmodule RockcutApi.Production.SplitMovesTest do
  @moduledoc """
  D48 DEV QA fix cycle 5: a split batch moves as one tree (Y1), and what
  empties a tank waits for brew day (Y2). Fix cycle 6 (Z1): a part's exit
  waits for its parent's Split, and the Split stays done while one is.
  Fix cycle 7 (AA1, AA2): Undo obeys the same order.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{Batches, Schedule, Splits, Steps, Undo}

  # Brew Nov 2: FDH Nov 9, Set temp 58° Nov 12, Carb Nov 16, Package and CIP Nov 22.
  # Split Nov 13: the parent keeps Brew day, FDH and Set temp; each part
  # gets Carb, Package and CIP.
  @brew ~D[2026-11-02]
  @today ~D[2026-10-21]

  setup do
    fv2 = tank!("FV2")
    fv6 = tank!("FV6")
    batch = plan!(brand!("Galactic"), ale_template!(), @brew, %{"tank_ids" => [fv2.id]})

    {:ok, %{part_ids: [p1, p2]}} =
      Splits.split(reload(batch), %{
        "due_on" => "2026-11-13",
        "parts" => [
          %{"stays" => true, "volume_bbl" => "12"},
          %{"tank_id" => fv6.id, "volume_bbl" => "8"}
        ]
      })

    %{
      batch: batch,
      p1: Repo.get!(Batch, p1),
      p2: Repo.get!(Batch, p2),
      fv6: fv6,
      brewer: user_with_role("employee", "brewery")
    }
  end

  defp dates(batch), do: Enum.map(layout(batch), fn {name, day, _} -> {name, day} end)

  defp part_dates(days) do
    [
      {"Carb", Date.add(~D[2026-11-16], days)},
      {"Package", Date.add(~D[2026-11-22], days)},
      {"CIP & Sanitize", Date.add(~D[2026-11-22], days)}
    ]
  end

  defp split_step(ctx), do: named(ctx.batch, "Split - Transfer")

  defp flags(today \\ @today) do
    {:ok, s} = Schedule.load(Date.add(today, -30), Date.add(today, 90), today)
    s.flags
  end

  describe "Y1: Move all on a parent step takes the parts along" do
    test "from Brew day: the prompt lists the parts' steps; they move by the same days", ctx do
      brew = named(ctx.batch, "Brew day")

      assert {:ok, {:preview, pre}} = Steps.move([brew.id], 7, preview: true)
      assert pre.default_answer == "move_all"

      assert Enum.map(pre.batches, & &1.label) == [
               "Galactic P1",
               "Galactic P1.1",
               "Galactic P1.2"
             ]

      # The prompt says "Galactic P1 and its 2 parts" from these.
      assert Enum.map(pre.batches, & &1.split_parent_id) == [nil, ctx.batch.id, ctx.batch.id]

      by_batch = Enum.group_by(pre.following, & &1.batch_id, & &1.name)
      assert by_batch[ctx.batch.id] == ["FDH", "Set temp - 58°", "Split - Transfer"]

      for p <- [ctx.p1, ctx.p2],
          do: assert(Enum.sort(by_batch[p.id]) == ["CIP & Sanitize", "Carb", "Package"])

      assert {:ok, %{batch_ids: ids, out_of_order: []}} =
               Steps.move([brew.id], 7, answer: "move_all")

      assert Enum.sort(ids) == Enum.sort([ctx.batch.id, ctx.p1.id, ctx.p2.id])
      assert named(ctx.batch, "Split - Transfer").due_on == ~D[2026-11-20]
      assert dates(ctx.p1) == part_dates(7)
      assert dates(ctx.p2) == part_dates(7)
      refute Enum.any?(flags(), &(&1.kind == "out_of_order"))
    end

    test "from FDH, which isn't the first step: the same", ctx do
      assert {:ok, _} = Steps.move([named(ctx.batch, "FDH").id], 3, answer: "move_all")
      assert split_step(ctx).due_on == ~D[2026-11-16]
      assert named(ctx.batch, "Brew day").due_on == @brew
      assert dates(ctx.p1) == part_dates(3)
      assert dates(ctx.p2) == part_dates(3)
    end

    test "the Split itself: the parts go with it, with either answer and with none", ctx do
      split = split_step(ctx)

      # Nothing else follows the Split here (part 1 stays): no prompt, the parts are carried.
      assert {:ok, {:preview, pre}} = Steps.move([split.id], 7, preview: true)
      assert pre.following == [] and pre.default_answer == nil
      assert length(pre.carried) == 6
      assert {:ok, _} = Steps.move([split.id], 7)
      assert dates(ctx.p1) == part_dates(7)
      assert dates(ctx.p2) == part_dates(7)

      assert {:ok, _} = Steps.move([split.id], 2, answer: "move_only")
      assert split_step(ctx).due_on == ~D[2026-11-22]
      assert dates(ctx.p2) == part_dates(9)

      # QA's +20: never past the parts' Package.
      assert {:ok, _} = Steps.move([split.id], 20, answer: "move_all")
      assert dates(ctx.p1) == part_dates(29)
      refute Enum.any?(flags(), &(&1.kind == "out_of_order"))
    end

    test "Shift (the bar drag) on the parent takes the parts along", ctx do
      assert {:ok, %{moved: 10}} = Batches.shift(reload(ctx.batch), 4)
      assert split_step(ctx).due_on == ~D[2026-11-17]
      assert dates(ctx.p2) == part_dates(4)
    end

    test "Move only on Brew day leaves the Split and the parts", ctx do
      brew = named(ctx.batch, "Brew day")
      assert {:ok, _} = Steps.move([brew.id], 2, answer: "move_only")
      assert split_step(ctx).due_on == ~D[2026-11-13]
      assert dates(ctx.p1) == part_dates(0)
    end

    test "a part's step before its split is flagged out of order, named by the part", ctx do
      # Move only on the part's Carb, back before the Nov 13 split (QA's FDH −6).
      carb = named(ctx.p2, "Carb")
      assert {:ok, {:preview, pre}} = Steps.move([carb.id], -6, preview: true)
      assert [%{from_name: "Split - Transfer", to_name: "Carb"}] = pre.out_of_order["move_only"]

      assert {:ok, %{out_of_order: [%{from_name: "Split - Transfer", to_name: "Carb"}]}} =
               Steps.move([carb.id], -6, answer: "move_only")

      assert [flag] = Enum.filter(flags(), &(&1.kind == "out_of_order"))

      assert flag.message ==
               "Galactic P1.2: Carb is before Split - Transfer, the step it follows."

      assert Enum.sort(flag.batch_ids) == Enum.sort([ctx.p2.id, ctx.batch.id])

      # Fixed by moving it back: the flag goes.
      assert {:ok, _} = Steps.move([named(ctx.p2, "Carb").id], 6, answer: "move_only")
      refute Enum.any?(flags(), &(&1.kind == "out_of_order"))
    end

    test "a done step on a part blocks a move that would take the parts", ctx do
      done!(named(ctx.p2, "Carb"))
      brew = named(ctx.batch, "Brew day")
      refusal = {:error, {:part_done, "Galactic P1.2", "Carb"}}

      assert refusal == Steps.move([brew.id], 7, answer: "move_all")
      assert refusal == Steps.move([split_step(ctx).id], 7, answer: "move_only")
      assert refusal == Steps.move([split_step(ctx).id], 7, preview: true)
      assert refusal == Batches.shift(reload(ctx.batch), 7)
      assert split_step(ctx).due_on == ~D[2026-11-13]
      assert dates(ctx.p1) == part_dates(0)

      # Move only from Brew day doesn't touch the parts, so it's allowed.
      assert {:ok, _} = Steps.move([brew.id], 1, answer: "move_only")
    end

    test "Undo puts the whole tree back", ctx do
      before = Enum.map([ctx.batch, ctx.p1, ctx.p2], &dates/1)
      brew = named(ctx.batch, "Brew day")

      {:ok, {_, token}} =
        Undo.track(ctx.brewer, %{batches: [ctx.batch.id]}, fn ->
          Steps.move([brew.id], 7, answer: "move_all")
        end)

      assert dates(ctx.p2) == part_dates(7)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert Enum.map([ctx.batch, ctx.p1, ctx.p2], &dates/1) == before

      # The Split's own move too.
      {:ok, {_, token}} =
        Undo.track(ctx.brewer, %{batches: [ctx.batch.id]}, fn ->
          Steps.move([split_step(ctx).id], 5)
        end)

      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert Enum.map([ctx.batch, ctx.p1, ctx.p2], &dates/1) == before
    end
  end

  describe "Y2: a Split, Transfer/Filter or Package waits for brew day" do
    test "QA's sequence can't happen: the Split's check-off is refused", ctx do
      today = ~D[2026-11-14]
      split = split_step(ctx)

      refusal = {:error, {:before_brew_day, :check_off}}
      assert refusal == Steps.complete(split.id, %{}, ctx.brewer, today: today)
      assert refusal == Steps.complete(split.id, %{}, ctx.brewer, today: today, preview: true)

      assert reload(ctx.batch).status == "planned"
      assert Batches.p_numbers()[ctx.batch.id]
      assert is_nil(split_step(ctx).done_on)

      # Nothing was done, so after Undo split it can still be deleted.
      assert {:ok, _} = Splits.undo_split(reload(ctx.batch))
      assert {:ok, _} = Batches.delete_planned(reload(ctx.batch))
    end

    test "a part's Package waits for the parent's brew day", ctx do
      package = named(ctx.p1, "Package")

      assert {:error, {:before_brew_day, :check_off}} =
               Steps.complete(package.id, %{}, ctx.brewer, today: ~D[2026-11-22])

      assert reload(ctx.p1).status == "planned"
    end

    test "Transfer and Package on a batch that isn't split", ctx do
      t = lager_template!()
      lager = plan!(brand!("Pils"), t, ~D[2026-10-05])
      transfer = Enum.find(steps_of(lager), &(Steps.behavior(&1) == "transfer"))
      package = named(lager, "Package")

      for s <- [transfer, package] do
        assert {:error, {:before_brew_day, :check_off}} =
                 Steps.complete(s.id, %{"done_on" => Date.to_iso8601(@today)}, ctx.brewer,
                   today: @today,
                   preview: true
                 )

        assert {:error, {:before_brew_day, :check_off}} =
                 Steps.complete(
                   s.id,
                   %{"done_on" => Date.to_iso8601(@today), "answer" => "move_only"},
                   ctx.brewer,
                   today: @today
                 )
      end

      assert reload(lager).status == "planned"
      # Other steps can still be checked off before brew day (as PDH could).
      other =
        Enum.find(steps_of(lager), &(Steps.behavior(&1) not in ~w(brew transfer package split)))

      assert {:ok, _} =
               Steps.complete(other.id, %{"answer" => "move_only"}, ctx.brewer,
                 today: other.due_on
               )

      assert reload(lager).status == "planned"
    end

    test "once brewed, the Split checks off and un-checks as before", ctx do
      today = ~D[2026-11-13]
      brew = named(ctx.batch, "Brew day")

      {:ok, _} =
        Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)

      assert {:ok, _} = Steps.complete(split_step(ctx).id, %{}, ctx.brewer, today: today)
      assert reload(ctx.batch).status == "completed"
      assert reload(ctx.p1).status == "fermenting"

      # Brew day stays done while the Split is.
      assert {:error, {:exit_done, "Split - Transfer"}} = Steps.uncomplete(brew.id)

      assert {:ok, _} = Steps.uncomplete(split_step(ctx).id)
      assert reload(ctx.batch).status == "fermenting"
      assert reload(ctx.batch).batch_number == "40"
      assert reload(ctx.p1).status == "planned"

      assert {:ok, _} = Steps.uncomplete(brew.id)
      assert %Batch{status: "planned", batch_number: nil} = reload(ctx.batch)
      assert Batches.p_numbers()[ctx.batch.id]
    end

    test "un-checking never leaves a brewed status without brew day", ctx do
      # A batch already in QA's state (from before this fix): Mark not done
      # on the Split puts it back to planned.
      split = split_step(ctx)
      split |> Ecto.Changeset.change(done_on: ~D[2026-11-13]) |> Repo.update!()
      reload(ctx.batch) |> Ecto.Changeset.change(status: "completed") |> Repo.update!()

      assert {:ok, _} = Steps.uncomplete(split.id)
      assert %Batch{status: "planned", batch_number: nil} = reload(ctx.batch)
      assert Batches.p_numbers()[ctx.batch.id]
      assert {:ok, _} = Splits.undo_split(reload(ctx.batch))
      assert {:ok, _} = Batches.delete_planned(reload(ctx.batch))
    end
  end

  describe "Z1: a split part can't get ahead of its parent's Split" do
    defp brew_day!(ctx) do
      brew = named(ctx.batch, "Brew day")
      {:ok, _} = Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)
      brew
    end

    defp check!(step, ctx, today),
      do: Steps.complete(step.id, %{"answer" => "move_only"}, ctx.brewer, today: today)

    test "a part's Package waits for the Split, on either part (QA's route 2)", ctx do
      brew_day!(ctx)
      refusal = {:error, {:before_split, :check_off, "Split - Transfer"}}

      # Part 1 stays in the tank, part 2 goes to FV6: both wait.
      for part <- [ctx.p1, ctx.p2] do
        package = named(part, "Package")

        assert refusal ==
                 Steps.complete(package.id, %{}, ctx.brewer, today: ~D[2026-11-22], preview: true)

        assert refusal == check!(package, ctx, ~D[2026-11-22])
        assert is_nil(named(part, "Package").done_on)
        assert reload(part).status == "planned"
      end

      # Control: a part's Carb (not an exit) can still be checked off before the Split.
      assert {:ok, _} = check!(named(ctx.p2, "Carb"), ctx, ~D[2026-11-16])
      assert reload(ctx.p2).status == "planned"
      assert {:ok, _} = Steps.uncomplete(named(ctx.p2, "Carb").id)
      assert reload(ctx.p2).status == "planned"
    end

    test "before_brew_day wins over before_split", ctx do
      package = named(ctx.p2, "Package")

      assert {:error, {:before_brew_day, :check_off}} =
               Steps.complete(package.id, %{}, ctx.brewer, today: ~D[2026-11-22], preview: true)
    end

    test "the Split stays done while a part's exit is (QA's route 1)", ctx do
      brew = brew_day!(ctx)
      split = split_step(ctx)
      assert {:ok, _} = check!(split, ctx, ~D[2026-11-13])
      assert {:ok, _} = check!(named(ctx.p2, "Package"), ctx, ~D[2026-11-22])
      assert reload(ctx.p2).status == "completed"

      assert {:error, {:part_exit_done, "Galactic #40.2", "Package"}} =
               Steps.uncomplete(split.id)

      assert split_step(ctx).done_on

      # In order: the part's Package, then the Split, then brew day.
      assert {:ok, _} = Steps.uncomplete(named(ctx.p2, "Package").id)
      assert reload(ctx.p2).status == "fermenting"
      assert {:ok, _} = Steps.uncomplete(split.id)
      assert reload(ctx.p1).status == "planned"
      assert reload(ctx.p2).status == "planned"
      assert {:ok, _} = Steps.uncomplete(brew.id)
      assert reload(ctx.batch).status == "planned"
      assert reload(ctx.p2).status == "planned"
    end

    test "un-checking the Split makes every part planned, a part with a done step too", ctx do
      brew_day!(ctx)
      split = split_step(ctx)
      assert {:ok, _} = check!(split, ctx, ~D[2026-11-13])
      assert {:ok, _} = check!(named(ctx.p2, "Carb"), ctx, ~D[2026-11-16])
      assert reload(ctx.p2).status == "fermenting"

      assert {:ok, _} = Steps.uncomplete(split.id)
      assert reload(ctx.p1).status == "planned"
      assert reload(ctx.p2).status == "planned"
    end

    test "a part left fermenting before the fix is put right by the next un-check", ctx do
      brew = brew_day!(ctx)
      reload(ctx.p2) |> Ecto.Changeset.change(status: "fermenting") |> Repo.update!()

      assert {:ok, _} = Steps.uncomplete(brew.id)
      assert reload(ctx.p2).status == "planned"
    end

    test "a part's Transfer waits for the Split; an unsplit lager's order is unchanged", ctx do
      t = lager_template!()
      lager = plan!(brand!("Pils"), t, ~D[2026-09-01], %{"tank_ids" => [tank!("FV3").id]})
      transfer = Enum.find(steps_of(lager), &(Steps.behavior(&1) == "transfer"))
      package = named(lager, "Package")
      lager_brew = named(lager, "Brew day")

      {:ok, _} =
        Steps.complete(lager_brew.id, %{"batch_number" => "41"}, ctx.brewer,
          today: lager_brew.due_on
        )

      # Unsplit: Package before Transfer is still allowed, and un-checks to fermenting.
      assert {:ok, _} = check!(package, ctx, package.due_on)
      assert reload(lager).status == "completed"
      assert {:ok, _} = Steps.uncomplete(package.id)
      assert reload(lager).status == "fermenting"

      # Split before the transfer: each part's Transfer waits for the Split.
      split_on = Date.add(transfer.due_on, -3)

      {:ok, %{part_ids: [q1, _]}} =
        Splits.split(reload(lager), %{
          "due_on" => Date.to_iso8601(split_on),
          "parts" => [
            %{"stays" => true, "volume_bbl" => "10"},
            %{"tank_id" => tank!("FV7").id, "volume_bbl" => "10"}
          ]
        })

      part_transfer =
        Repo.get!(Batch, q1) |> steps_of() |> Enum.find(&(Steps.behavior(&1) == "transfer"))

      assert {:error, {:before_split, :check_off, "Split - Transfer"}} =
               check!(part_transfer, ctx, part_transfer.due_on)
    end
  end

  describe "AA1: Undo obeys the order rules" do
    # Brew day done; part 2 gets a Transfer on Nov 18 into FV8.
    setup ctx do
      brew = named(ctx.batch, "Brew day")
      {:ok, _} = Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)

      {:ok, _} =
        RockcutApi.Production.BatchChanges.add_transfer(reload(ctx.p2), %{
          "due_on" => "2026-11-18",
          "tank_id" => tank!("FV8").id
        })

      %{brew: brew, other: user_with_role("employee", "brewery")}
    end

    defp tracked(ctx, fun), do: Undo.track(ctx.brewer, %{batches: [ctx.batch.id]}, fun)

    defp check(step, user, today),
      do: Steps.complete(step.id, %{"answer" => "move_only"}, user, today: today)

    defp transfer(ctx), do: named(ctx.p2, "Transfer")

    defp done_ids(ctx),
      do: for(b <- [ctx.batch, ctx.p1, ctx.p2], s <- steps_of(b), s.done_on, do: s.id)

    test "path A: Undo of the Split's check-off after another user checks off a part's Transfer",
         ctx do
      {:ok, {_, token}} =
        tracked(ctx, fn -> check(split_step(ctx), ctx.brewer, ~D[2026-11-13]) end)

      assert {:ok, _} = check(transfer(ctx), ctx.other, ~D[2026-11-18])
      before = done_ids(ctx)

      assert {:error, {:part_exit_done, "Galactic #40.2", "Transfer"}} =
               Undo.undo(ctx.brewer, token)

      assert done_ids(ctx) == before
      assert reload(ctx.p2).status == "fermenting"

      # Still available: once the Transfer is not done, the same Undo works.
      assert {:ok, _} = Steps.uncomplete(transfer(ctx).id)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert is_nil(split_step(ctx).done_on)
      assert reload(ctx.p2).status == "planned"
    end

    test "path B: Undo of the Split's check-off after a part's Package - Partial", ctx do
      {:ok, _} = Steps.update(named(ctx.p2, "Package"), %{"package_partial" => true})

      {:ok, {_, token}} =
        tracked(ctx, fn -> check(split_step(ctx), ctx.brewer, ~D[2026-11-13]) end)

      partial = named(ctx.p2, "Package - Partial")
      assert {:ok, _} = check(partial, ctx.brewer, ~D[2026-11-22])

      assert {:error, {:part_exit_done, "Galactic #40.2", "Package - Partial"}} =
               Undo.undo(ctx.brewer, token)

      assert split_step(ctx).done_on

      assert {:ok, _} = Steps.uncomplete(partial.id)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert is_nil(split_step(ctx).done_on)
    end

    test "path C: Undo of a part's Transfer un-check after the Split is un-checked", ctx do
      assert {:ok, _} = check(split_step(ctx), ctx.brewer, ~D[2026-11-13])
      assert {:ok, _} = check(transfer(ctx), ctx.brewer, ~D[2026-11-18])
      {:ok, {_, token}} = tracked(ctx, fn -> Steps.uncomplete(transfer(ctx).id) end)
      assert {:ok, _} = Steps.uncomplete(split_step(ctx).id)

      assert {:error, {:before_split, :check_off, "Split - Transfer"}} =
               Undo.undo(ctx.brewer, token)

      assert is_nil(transfer(ctx).done_on)
      assert reload(ctx.p2).status == "planned"

      # The Split done again: the Undo puts the Transfer back.
      assert {:ok, _} = check(split_step(ctx), ctx.brewer, ~D[2026-11-13])
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert transfer(ctx).done_on
    end

    test "brew day: Undo of an exit's un-check after brew day is un-checked; Undo of brew day's check-off",
         ctx do
      t = lager_template!()
      lager = plan!(brand!("Pils"), t, ~D[2026-09-01], %{"tank_ids" => [tank!("FV3").id]})
      lager_brew = named(lager, "Brew day")
      {:ok, _} = Steps.update(named(lager, "Package"), %{"package_partial" => true})
      partial = named(lager, "Package - Partial")
      track = &Undo.track(ctx.brewer, %{batches: [lager.id]}, &1)

      {:ok, {_, brew_token}} =
        track.(fn ->
          Steps.complete(lager_brew.id, %{"batch_number" => "41"}, ctx.brewer,
            today: lager_brew.due_on
          )
        end)

      assert {:ok, _} = check(partial, ctx.brewer, partial.due_on)

      # Undoing the check-off is an un-check: brew day stays done while an exit is.
      assert {:error, {:exit_done, "Package - Partial"}} = Undo.undo(ctx.brewer, brew_token)
      assert named(lager, "Brew day").done_on

      # Undoing an un-check is a check-off: the exit waits for brew day.
      {:ok, {_, token}} = track.(fn -> Steps.uncomplete(partial.id) end)
      assert {:ok, _} = Steps.uncomplete(lager_brew.id)
      assert {:error, {:before_brew_day, :check_off}} = Undo.undo(ctx.brewer, token)
      assert is_nil(named(lager, "Package - Partial").done_on)
      assert reload(lager).status == "planned"
    end

    test "controls: plain Undos still work; a full Package is refused by the rule (BB2)", ctx do
      carb = named(ctx.p2, "Carb")
      {:ok, {_, token}} = tracked(ctx, fn -> check(carb, ctx.brewer, ~D[2026-11-16]) end)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert is_nil(named(ctx.p2, "Carb").done_on)

      assert {:ok, _} = check(split_step(ctx), ctx.brewer, ~D[2026-11-13])
      {:ok, {_, token}} = tracked(ctx, fn -> Steps.uncomplete(split_step(ctx).id) end)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert split_step(ctx).done_on
      assert reload(ctx.p2).status == "fermenting"

      # Recheck 6's caught case: the full Package. D49 BB2: the rule's own
      # refusal now, as the direct un-check (was `undo_stale`).
      {:ok, {_, token}} = tracked(ctx, fn -> Steps.uncomplete(split_step(ctx).id) end)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      {:ok, _} = Steps.uncomplete(split_step(ctx).id)

      {:ok, {_, token}} =
        tracked(ctx, fn -> check(split_step(ctx), ctx.brewer, ~D[2026-11-13]) end)

      assert {:ok, _} = check(named(ctx.p1, "Package"), ctx.brewer, ~D[2026-11-22])

      assert {:error, {:part_exit_done, "Galactic #40.1", "Package"}} =
               Undo.undo(ctx.brewer, token)
    end
  end

  describe "BB2: every Undo route refuses with the rule, and comes back once it's cleared" do
    # The blocker was cleared a while after the write: in real time the
    # rows it touched since carry a later `updated_at`.
    defp later!(ctx) do
      ids = [ctx.batch.id, ctx.p1.id, ctx.p2.id]
      at = DateTime.utc_now() |> DateTime.add(60) |> DateTime.truncate(:second)
      Repo.update_all(from(b in Batch, where: b.id in ^ids), set: [updated_at: at])

      Repo.update_all(
        from(s in RockcutApi.Production.Step, where: s.batch_id in ^ids),
        set: [updated_at: at]
      )
    end

    defp full_package(ctx), do: named(ctx.p2, "Package")

    test "the Split's Undo after a part's full Package: part_exit_done", ctx do
      brew_day!(ctx)

      {:ok, {_, token}} =
        tracked(ctx, fn -> check(split_step(ctx), ctx.brewer, ~D[2026-11-13]) end)

      assert {:ok, _} = check(full_package(ctx), ctx.brewer, ~D[2026-11-22])
      assert reload(ctx.p2).status == "completed"

      assert {:error, {:part_exit_done, "Galactic #40.2", "Package"}} =
               Undo.undo(ctx.brewer, token)

      assert split_step(ctx).done_on
      assert full_package(ctx).done_on

      assert {:ok, _} = Steps.uncomplete(full_package(ctx).id)
      later!(ctx)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert is_nil(split_step(ctx).done_on)
      assert reload(ctx.batch).status == "fermenting"
      assert Enum.map([ctx.p1, ctx.p2], &reload(&1).status) == ["planned", "planned"]
    end

    test "brew day's Undo in a split family after the Split: exit_done", ctx do
      {:ok, {_, token}} =
        tracked(ctx, fn ->
          Steps.complete(named(ctx.batch, "Brew day").id, %{"batch_number" => "40"}, ctx.brewer,
            today: @brew
          )
        end)

      assert {:ok, _} = check(split_step(ctx), ctx.brewer, ~D[2026-11-13])

      assert {:error, {:exit_done, "Split - Transfer"}} = Undo.undo(ctx.brewer, token)
      assert named(ctx.batch, "Brew day").done_on
      assert reload(ctx.batch).batch_number == "40"

      assert {:ok, _} = Steps.uncomplete(split_step(ctx).id)
      later!(ctx)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert is_nil(named(ctx.batch, "Brew day").done_on)
      assert %{status: "planned", batch_number: nil} = reload(ctx.batch)
    end

    test "a Split un-check's Undo after brew day is un-checked: before_brew_day", ctx do
      brew_day!(ctx)
      assert {:ok, _} = check(split_step(ctx), ctx.brewer, ~D[2026-11-13])
      {:ok, {_, token}} = tracked(ctx, fn -> Steps.uncomplete(split_step(ctx).id) end)
      assert {:ok, _} = Steps.uncomplete(named(ctx.batch, "Brew day").id)

      assert {:error, {:before_brew_day, :check_off}} = Undo.undo(ctx.brewer, token)
      assert is_nil(split_step(ctx).done_on)

      brew_day!(ctx)
      later!(ctx)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert split_step(ctx).done_on
      assert Enum.map([ctx.p1, ctx.p2], &reload(&1).status) == ["fermenting", "fermenting"]
    end

    test "a late Split's Undo after a part's exit: part_exit_done, then the dates come back",
         ctx do
      brew_day!(ctx)
      planned = {dates(ctx.batch), dates(ctx.p1), dates(ctx.p2)}

      {:ok, {_, token}} =
        tracked(ctx, fn ->
          Steps.complete(split_step(ctx).id, %{"answer" => "move_all"}, ctx.brewer,
            today: ~D[2026-11-16]
          )
        end)

      assert dates(ctx.p2) == part_dates(3)
      package = full_package(ctx)
      assert {:ok, _} = check(package, ctx.brewer, package.due_on)

      assert {:error, {:part_exit_done, "Galactic #40.2", "Package"}} =
               Undo.undo(ctx.brewer, token)

      assert split_step(ctx).done_on
      assert full_package(ctx).done_on
      assert dates(ctx.p2) == part_dates(3)

      assert {:ok, _} = Steps.uncomplete(package.id)
      later!(ctx)
      assert {:ok, _} = Undo.undo(ctx.brewer, token)
      assert is_nil(split_step(ctx).done_on)
      assert {dates(ctx.batch), dates(ctx.p1), dates(ctx.p2)} == planned
    end

    test "the rule comes first; a real change since is still stale once it's cleared", ctx do
      brew_day!(ctx)

      {:ok, {_, token}} =
        tracked(ctx, fn -> check(split_step(ctx), ctx.brewer, ~D[2026-11-13]) end)

      assert {:ok, _} = check(full_package(ctx), ctx.brewer, ~D[2026-11-22])
      {:ok, _} = Steps.update(split_step(ctx), %{"notes" => "Moved by hand"})

      assert {:error, {:part_exit_done, _, _}} = Undo.undo(ctx.brewer, token)

      assert {:ok, _} = Steps.uncomplete(full_package(ctx).id)
      assert {:error, :undo_stale} = Undo.undo(ctx.brewer, token)
      assert split_step(ctx).done_on
      assert split_step(ctx).notes == "Moved by hand"
    end
  end

  describe "AA2: exit_done names the part" do
    test "a part's done exit is named with the part; the parent's own isn't", ctx do
      brew = named(ctx.batch, "Brew day")
      {:ok, _} = Steps.complete(brew.id, %{"batch_number" => "40"}, ctx.brewer, today: @brew)

      # AA1's state, written directly: a part's Package done, the Split not.
      package = done!(named(ctx.p2, "Package"))
      assert {:error, {:exit_done, "Galactic #40.2: Package"}} = Steps.uncomplete(brew.id)

      package |> Ecto.Changeset.change(done_on: nil) |> Repo.update!()
      assert {:ok, _} = Steps.complete(split_step(ctx).id, %{}, ctx.brewer, today: ~D[2026-11-13])
      assert {:error, {:exit_done, "Split - Transfer"}} = Steps.uncomplete(brew.id)
    end
  end
end
