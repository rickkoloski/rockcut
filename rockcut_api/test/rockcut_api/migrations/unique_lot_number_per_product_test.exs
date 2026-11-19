defmodule RockcutApi.Migrations.UniqueLotNumberPerProductTest do
  @moduledoc """
  D61 §3.3 (`unique_lot_number_per_product`) run for real: down (no index),
  a product gets duplicate lot numbers, up renames all but the oldest
  (" (2)", " (3)", skipping a name already taken) and adds the index. Other
  products, lots without a number and lots without a product are left alone.
  Run inside the test's transaction (SQLite's DDL is transactional).
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.IngredientFixtures

  @version 20_261_118_120_002
  @migration RockcutApi.Repo.Migrations.UniqueLotNumberPerProduct

  setup_all do
    Code.require_file("priv/repo/migrations/20261118120002_unique_lot_number_per_product.exs")
    :ok
  end

  defp index? do
    %{rows: [[n]]} =
      Repo.query!(
        "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?",
        ["ingredient_lots_product_id_lot_number_index"]
      )

    n == 1
  end

  defp number(lot), do: Repo.reload!(lot).lot_number

  test "duplicates are renamed, oldest keeps its number; then the index refuses one" do
    c = grain_catalog!()
    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    refute index?()

    day = ~D[2026-10-01]
    first = stocked_lot!(c.product, day, "55", "A1")
    second = stocked_lot!(c.product, day, "55", "A1")
    taken = stocked_lot!(c.product, day, "55", "A1 (2)")
    third = stocked_lot!(c.product, day, "55", "A1")
    single = stocked_lot!(c.product, day, "55", "B7")
    other = stocked_lot!(product!(c.two_row, c.root_shoot), day, "55", "A1")
    blank = for _ <- 1..2, do: stocked_lot!(c.product, day, "55", nil)

    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)
    assert index?()

    assert number(first) == "A1"
    assert number(taken) == "A1 (2)"
    assert number(second) == "A1 (3)"
    assert number(third) == "A1 (4)"
    assert number(single) == "B7"
    assert number(other) == "A1"
    assert Enum.map(blank, &number/1) == [nil, nil]

    assert_raise Ecto.ConstraintError, fn -> stocked_lot!(c.product, day, "55", "B7") end
  end
end
