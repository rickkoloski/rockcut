defmodule RockcutApi.Production.SplitTreeTest do
  @moduledoc """
  D48 DEV QA fix cycle 4: the N1 rule over a split's whole tree (X2), the
  part that stays moving with its parent's tank, Undo of an Undo split (X1),
  and Undo split putting the batch back as it was (X3).
  """
  use RockcutApi.DataCase

  import RockcutApi.AccountsFixtures
  import RockcutApi.ProductionFixtures

  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Production.{BatchChanges, Batches, Splits, Undo, UndoRecord}

  # Ale: brew Nov 2 in FV1, Package Nov 22. Lager: brew Nov 2 in FV1,
  # Transfer into BBT1 Nov 12, Package Nov 22.
  @brew ~D[2026-11-02]

  setup do
    tanks = Map.new(~w(FV1 BBT1 FV9 FV10), &{&1, tank!(&1)})

    %{
      t: tanks,
      owner: user_with_role("employee", "brewery"),
      other: user_with_role("employee", "brewery")
    }
  end

  defp ale(ctx), do: plan!(brand!("Galactic"), ale_template!(), @brew, tanks(ctx, ["FV1"]))

  defp lager(ctx),
    do: plan!(brand!("Enos"), lager_template!(), @brew, tanks(ctx, ["FV1", "BBT1"]))

  defp tanks(ctx, names), do: %{"tank_ids" => Enum.map(names, &ctx.t[&1].id)}

  # Split on Nov 5; each part is `:stays` or a tank name, 10 bbl each.
  defp split!(batch, ctx, parts) do
    {:ok, %{part_ids: ids}} = Splits.split(batch, split_attrs(ctx, parts))
    Enum.map(ids, &Repo.get!(Batch, &1))
  end

  defp split_attrs(ctx, parts) do
    %{
      "due_on" => "2026-11-05",
      "parts" =>
        Enum.map(parts, fn
          :stays -> %{"stays" => true, "volume_bbl" => "10"}
          name -> %{"tank_id" => ctx.t[name].id, "volume_bbl" => "10"}
        end)
    }
  end

  defp set(batch, k, ctx, name),
    do: Batches.set_vessel_tank(reload(batch), k, name && ctx.t[name].id)

  defp tank_names(batch, ctx) do
    names = Map.new(ctx.t, fn {name, t} -> {t.id, name} end)
    batch |> vessels() |> Map.new(fn {k, id} -> {k, names[id]} end)
  end

  describe "the tree rule on a tank change (X2)" do
    setup ctx do
      parent = ale(ctx)
      [p1, p2] = split!(parent, ctx, [:stays, "FV9"])
      %{parent: parent, p1: p1, p2: p2}
    end

    test "the parent into the tank part 2 goes into: refused, named on part 2", ctx do
      assert {:error, {:part, 2, {:same_tank, "FV9"}}} = set(ctx.parent, 0, ctx, "FV9")
      assert tank_names(ctx.parent, ctx) == %{0 => "FV1"}
      assert tank_names(ctx.p1, ctx) == %{0 => "FV1"}
    end

    test "part 2 into the tank part 1 stays in: refused", ctx do
      assert {:error, {:part, 2, {:stays_there, "FV1", 1}}} = set(ctx.p2, 0, ctx, "FV1")
      assert tank_names(ctx.p2, ctx) == %{0 => "FV9"}
    end

    test "the part that stays into part 2's tank: refused, named on part 1", ctx do
      assert {:error, {:part, 1, {:goes_there, "FV9", 2}}} = set(ctx.p1, 0, ctx, "FV9")
      assert tank_names(ctx.parent, ctx) == %{0 => "FV1"}
    end

    test "the parent into another tank takes the part that stays with it, and back", ctx do
      assert {:ok, _} = set(ctx.parent, 0, ctx, "FV10")
      assert tank_names(ctx.p1, ctx) == %{0 => "FV10"}

      assert {:ok, _} = set(ctx.p1, 0, ctx, "BBT1")
      assert tank_names(ctx.parent, ctx) == %{0 => "BBT1"}
      assert tank_names(ctx.p2, ctx) == %{0 => "FV9"}
    end

    test "part 2 into another free tank is fine", ctx do
      assert {:ok, _} = set(ctx.p2, 0, ctx, "FV10")
    end

    test "its Undo puts the parent and the part that stays back together", ctx do
      {:ok, {_, token}} =
        Undo.track(ctx.owner, %{batches: [ctx.p1.id]}, fn -> set(ctx.p1, 0, ctx, "FV10") end)

      assert tank_names(ctx.parent, ctx) == %{0 => "FV10"}
      assert {:ok, _} = Undo.undo(ctx.owner, token)
      assert tank_names(ctx.parent, ctx) == %{0 => "FV1"}
      assert tank_names(ctx.p1, ctx) == %{0 => "FV1"}
    end

    test "a transfer before the Split takes the part that stays with it", ctx do
      assert {:error, {:part, 2, {:same_tank, "FV9"}}} =
               BatchChanges.add_transfer(reload(ctx.parent), %{
                 "due_on" => "2026-11-04",
                 "tank_id" => ctx.t["FV9"].id
               })

      {:ok, _} =
        BatchChanges.add_transfer(reload(ctx.parent), %{
          "due_on" => "2026-11-04",
          "tank_id" => ctx.t["FV10"].id
        })

      assert tank_names(ctx.parent, ctx) == %{0 => "FV1", 1 => "FV10"}
      assert tank_names(ctx.p1, ctx) == %{0 => "FV10"}

      transfer =
        Enum.find(steps_of(ctx.parent), &(&1.due_on == ~D[2026-11-04] and &1.vessel_index == 1))

      {:ok, _} = BatchChanges.remove_step(transfer)
      assert tank_names(ctx.parent, ctx) == %{0 => "FV1"}
      assert tank_names(ctx.p1, ctx) == %{0 => "FV1"}
    end
  end

  test "nothing stays: parts don't share a tank or go back into the parent's", ctx do
    parent = ale(ctx)
    [_p1, p2] = split!(parent, ctx, ["FV9", "FV10"])

    assert {:error, {:part, 2, {:goes_there, "FV9", 1}}} = set(p2, 0, ctx, "FV9")
    assert {:error, {:part, 2, {:same_tank, "FV1"}}} = set(p2, 0, ctx, "FV1")
    # The parent into a part's tank, with nothing staying.
    assert {:error, {:part, 1, {:same_tank, "FV9"}}} = set(parent, 0, ctx, "FV9")
    assert {:ok, _} = set(parent, 0, ctx, "BBT1")
  end

  test "along a part's own path: named on the part", ctx do
    [p1, _p2] = split!(lager(ctx), ctx, [:stays, "FV9"])
    assert tank_names(p1, ctx) == %{0 => "FV1", 1 => "BBT1"}
    assert {:error, {:part, 1, {:same_tank, "FV1"}}} = set(p1, 1, ctx, "FV1")
  end

  describe "Undo of an Undo split (X1)" do
    setup ctx do
      parent = ale(ctx)
      split!(parent, ctx, [:stays, "FV9"])

      {:ok, {_, token}} =
        Undo.track(ctx.owner, %{batches: [parent.id]}, fn -> Splits.undo_split(reload(parent)) end)

      assert Splits.parts_of(parent) == []
      %{parent: parent, token: token}
    end

    test "QA's sequence: another user moves the merged batch into part 2's tank → stale", ctx do
      {:ok, _} =
        Undo.track(ctx.other, %{batches: [ctx.parent.id]}, fn ->
          set(ctx.parent, 0, ctx, "FV9")
        end)

      assert {:error, :undo_stale} = Undo.undo(ctx.owner, ctx.token)
      assert Splits.parts_of(ctx.parent) == []
      assert tank_names(ctx.parent, ctx) == %{0 => "FV9"}
    end

    test "into an unused tank → stale too", ctx do
      {:ok, _} = set(ctx.parent, 0, ctx, "FV10")
      assert {:error, :undo_stale} = Undo.undo(ctx.owner, ctx.token)
      assert Splits.parts_of(ctx.parent) == []
    end

    test "nothing changed since: it splits again", ctx do
      assert {:ok, _} = Undo.undo(ctx.owner, ctx.token)
      assert [p1, p2] = Splits.parts_of(ctx.parent)
      assert p1.split_stays and not p2.split_stays
      assert tank_names(p1, ctx) == %{0 => "FV1"}
      assert tank_names(p2, ctx) == %{0 => "FV9"}
    end

    test "the tree rule on what it puts back, even without the stale check", ctx do
      # A token from before the batch-wide check (no "vessels"), so only the
      # rows it changed are compared; the parent's vessel isn't one of them.
      record = Repo.get_by!(UndoRecord, token: ctx.token)

      record
      |> Ecto.Changeset.change(entries: Map.delete(record.entries, "vessels"))
      |> Repo.update!()

      {:ok, _} = set(ctx.parent, 0, ctx, "FV9")
      assert {:error, {:part, 2, {:same_tank, "FV9"}}} = Undo.undo(ctx.owner, ctx.token)
      assert Splits.parts_of(ctx.parent) == []
    end
  end

  describe "Undo split puts the batch back as it was (X3)" do
    # Brew day, a custom step after it on Nov 3 (so the step before the Split
    # isn't Brew day), the Transfer into BBT1 (from Brew day) and Package.
    setup ctx do
      batch = lager(ctx)

      {:ok, _} =
        BatchChanges.add_step(batch, %{
          "name" => "PDH",
          "due_on" => "2026-11-03",
          "comes_after_id" => named(batch, "Brew day").id
        })

      %{batch: batch, before: snapshot(batch)}
    end

    for {label, parts} <- [{"part 1 stays", [:stays, "FV9"]}, {"part 2 stays", ["FV9", :stays]}] do
      test "#{label}", ctx do
        split!(ctx.batch, ctx, unquote(parts))
        {:ok, _} = Splits.undo_split(reload(ctx.batch))
        assert snapshot(ctx.batch) == ctx.before
      end
    end

    test "nothing stays: part 1 kept the later tanks, and comes back", ctx do
      split!(ctx.batch, ctx, ["FV9", "FV10"])
      {:ok, _} = Splits.undo_split(reload(ctx.batch))
      assert snapshot(ctx.batch) == ctx.before
    end

    test "the links before the split: the Transfer still comes after Brew day", ctx do
      assert {"Brew day", "Transfer", "move_all"} in links(ctx.batch)
      refute Enum.any?(links(ctx.batch), &match?({"PDH", "Transfer", _}, &1))
    end
  end

  # The batch as a comparable value: its row, vessels, steps (without ids or
  # times) and links by step.
  defp snapshot(batch) do
    batch = reload(batch)
    steps = steps_of(batch)

    key =
      Map.new(steps, &{&1.id, {RockcutApi.Production.Steps.name(&1), &1.due_on, &1.vessel_index}})

    %{
      batch: Map.take(batch, [:template_id, :volume_bbl, :status, :split_links, :split_stays]),
      vessels: vessels(batch),
      steps:
        Enum.map(
          steps,
          &Map.drop(Map.from_struct(&1), [
            :id,
            :__meta__,
            :inserted_at,
            :updated_at,
            :step_type,
            :phase,
            :batch,
            :tank,
            :done_by,
            :assignee,
            :template_step
          ])
        ),
      links:
        Repo.all(
          from(l in RockcutApi.Production.StepLink, where: l.from_step_id in ^Map.keys(key))
        )
        |> Enum.map(&{key[&1.from_step_id], key[&1.to_step_id], &1.default_answer})
        |> Enum.sort()
    }
  end
end
