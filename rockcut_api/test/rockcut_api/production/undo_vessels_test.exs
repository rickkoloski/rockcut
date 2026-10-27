defmodule RockcutApi.Production.UndoVesselsTest do
  @moduledoc """
  D48 DEV QA R1: an Undo of a change to a batch's vessels is stale once any
  of that batch's vessels changed since, and what an Undo puts back passes
  the N1 rule (no two vessels in a row in one tank). One test per kind of
  change that touches vessels; moves don't, and keep their Undo.
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Production.{BatchChanges, Batches, BatchVessel, Splits, Steps, Undo}

  # Brew Nov 2 in FV1; Transfer into BBT1 Nov 12; Package Nov 22.
  @brew ~D[2026-11-02]

  setup do
    fv1 = tank!("FV1")
    bbt = tank!("BBT1")
    fv9 = tank!("FV9")
    lager = plan!(brand!("Enos"), lager_template!(), @brew, %{"tank_ids" => [fv1.id, bbt.id]})

    %{
      owner: user_with_role("employee", "brewery"),
      other: user_with_role("employee", "brewery"),
      lager: lager,
      fv1: fv1,
      bbt: bbt,
      fv9: fv9
    }
  end

  defp track(user, batch, fun), do: Undo.track(user, %{batches: [batch.id]}, fun)

  defp set_tank(user, batch, k, tank) do
    {:ok, _} =
      track(user, batch, fn -> Batches.set_vessel_tank(reload(batch), k, tank && tank.id) end)
  end

  test "the two-user sequence: Transfer to changed, then Ferment in, then Undo is stale (QA R1)",
       ctx do
    {:ok, {_, token}} = set_tank(ctx.owner, ctx.lager, 1, ctx.fv9)
    # Allowed: the beer now goes into FV9 next, not BBT1.
    set_tank(ctx.other, ctx.lager, 0, ctx.bbt)

    assert {:error, :undo_stale} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.bbt.id, 1 => ctx.fv9.id}
  end

  test "a tank change with nothing changed since still undoes", ctx do
    {:ok, {_, token}} = set_tank(ctx.owner, ctx.lager, 1, ctx.fv9)
    assert {:ok, _} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.fv1.id, 1 => ctx.bbt.id}
  end

  test "add transfer: stale once another vessel changed", ctx do
    {:ok, {_, token}} =
      track(ctx.owner, ctx.lager, fn ->
        BatchChanges.add_transfer(reload(ctx.lager), %{
          "due_on" => "2026-11-07",
          "tank_id" => ctx.fv9.id
        })
      end)

    assert vessels(ctx.lager) == %{0 => ctx.fv1.id, 1 => ctx.fv9.id, 2 => ctx.bbt.id}
    # Put back, it would be BBT1, then BBT1.
    set_tank(ctx.other, ctx.lager, 0, ctx.bbt)

    assert {:error, :undo_stale} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.bbt.id, 1 => ctx.fv9.id, 2 => ctx.bbt.id}
  end

  test "remove transfer: stale once another vessel changed", ctx do
    {:ok, _} =
      BatchChanges.add_transfer(ctx.lager, %{"due_on" => "2026-11-07", "tank_id" => ctx.fv9.id})

    transfer =
      Enum.find(steps_of(ctx.lager), &(&1.due_on == ~D[2026-11-07] and &1.vessel_index == 1))

    {:ok, {_, token}} = track(ctx.owner, ctx.lager, fn -> BatchChanges.remove_step(transfer) end)
    assert vessels(ctx.lager) == %{0 => ctx.fv1.id, 1 => ctx.bbt.id}
    # Put back, it would be FV9, then FV9.
    set_tank(ctx.other, ctx.lager, 0, ctx.fv9)

    assert {:error, :undo_stale} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.fv9.id, 1 => ctx.bbt.id}
  end

  test "template change: stale once another vessel changed", ctx do
    {:ok, {_, token}} =
      track(ctx.owner, ctx.lager, fn ->
        BatchChanges.change_template(reload(ctx.lager), ale_template!().id)
      end)

    assert vessels(ctx.lager) == %{0 => ctx.fv1.id}
    # Put back, it would be BBT1, then BBT1.
    set_tank(ctx.other, ctx.lager, 0, ctx.bbt)

    assert {:error, :undo_stale} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.bbt.id}
  end

  test "split: stale once a part's vessel changed", ctx do
    {:ok, {%{part_ids: [p1, _]}, token}} =
      track(ctx.owner, ctx.lager, fn ->
        Splits.split(reload(ctx.lager), %{
          "due_on" => "2026-11-05",
          "parts" => [
            %{"stays" => true, "volume_bbl" => "12"},
            %{"tank_id" => ctx.fv9.id, "volume_bbl" => "8"}
          ]
        })
      end)

    assert vessels(ctx.lager) == %{0 => ctx.fv1.id}
    assert vessels(Repo.get!(RockcutApi.Brewing.Batch, p1)) == %{0 => ctx.fv1.id, 1 => ctx.bbt.id}
    # The parent's tank is locked while split (fix cycle 4, Matt), so the
    # other user changes part 2's.
    [_, p2] = Splits.parts_of(ctx.lager)
    fv10 = tank!("FV10")
    set_tank(ctx.other, p2, 0, fv10)

    assert {:error, :undo_stale} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.fv1.id}
    assert vessels(p2) == %{0 => fv10.id, 1 => nil}
    assert length(Splits.parts_of(ctx.lager)) == 2
  end

  test "undo split: stale once the parent's vessel changed", ctx do
    {:ok, _} =
      Splits.split(ctx.lager, %{
        "due_on" => "2026-11-05",
        "parts" => [
          %{"stays" => true, "volume_bbl" => "12"},
          %{"tank_id" => ctx.fv9.id, "volume_bbl" => "8"}
        ]
      })

    {:ok, {_, token}} =
      track(ctx.owner, ctx.lager, fn -> Splits.undo_split(reload(ctx.lager)) end)

    assert vessels(ctx.lager) == %{0 => ctx.fv1.id, 1 => ctx.bbt.id}
    set_tank(ctx.other, ctx.lager, 0, ctx.fv9)

    assert {:error, :undo_stale} = Undo.undo(ctx.owner, token)
    assert Splits.parts_of(ctx.lager) == []
    assert vessels(ctx.lager) == %{0 => ctx.fv9.id, 1 => ctx.bbt.id}
  end

  test "Plan batch and Delete: their Undo still works, and is stale after a vessel change",
       ctx do
    {:ok, {_, token}} = track(ctx.owner, ctx.lager, fn -> Batches.delete_planned(ctx.lager) end)
    assert {:ok, _} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.fv1.id, 1 => ctx.bbt.id}

    {:ok, {{planned, _}, token}} =
      Undo.track(
        ctx.owner,
        %{},
        fn ->
          Batches.plan(%{
            "brand_id" => brand!("Fest").id,
            "template_id" => lager_template!("Lager 2").id,
            "brew_on" => "2026-12-01",
            "volume_bbl" => "20",
            "tank_ids" => [ctx.fv9.id, nil]
          })
        end,
        fn {b, _} -> %{batches: [b.id]} end
      )

    set_tank(ctx.other, planned, 1, ctx.bbt)
    assert {:error, :undo_stale} = Undo.undo(ctx.owner, token)
    assert vessels(planned) == %{0 => ctx.fv9.id, 1 => ctx.bbt.id}
  end

  test "a move doesn't touch vessels: its Undo isn't affected by a tank change", ctx do
    package = named(ctx.lager, "Package")

    {:ok, {_, token}} =
      track(ctx.owner, ctx.lager, fn -> Steps.move([package.id], 2, answer: "move_all") end)

    set_tank(ctx.other, ctx.lager, 1, ctx.fv9)
    assert {:ok, _} = Undo.undo(ctx.owner, token)
    assert named(ctx.lager, "Package").due_on == ~D[2026-11-22]
    assert vessels(ctx.lager) == %{0 => ctx.fv1.id, 1 => ctx.fv9.id}
  end

  test "what an Undo puts back passes the N1 rule (an older same-tank pair isn't restored)",
       ctx do
    # A pair from before the rule, put in directly.
    Repo.update_all(
      from(v in BatchVessel, where: v.batch_id == ^ctx.lager.id and v.vessel_index == 1),
      set: [tank_id: ctx.fv1.id]
    )

    {:ok, {_, token}} = set_tank(ctx.owner, ctx.lager, 1, ctx.fv9)

    assert {:error, {:same_tank, "FV1", ~D[2026-11-12]}} = Undo.undo(ctx.owner, token)
    assert vessels(ctx.lager) == %{0 => ctx.fv1.id, 1 => ctx.fv9.id}
  end
end
