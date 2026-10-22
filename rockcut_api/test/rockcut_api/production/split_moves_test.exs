defmodule RockcutApi.Production.SplitMovesTest do
  @moduledoc """
  D48 DEV QA fix cycle 5: a split batch moves as one tree (Y1), and what
  empties a tank waits for brew day (Y2).
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
end
