defmodule RockcutApi.Repo.Migrations.UniqueLotNumberPerProduct do
  @moduledoc """
  D61 §3.3 (D60 carry-over 5): a product's lot numbers are unique, so the
  same lot number within a product is always the same lot. Existing
  duplicates are renamed first: the oldest lot (lowest id) keeps the number,
  the others get " (2)", " (3)" … (skipping a name the product already has).
  Plain SQL, not the app schemas. Lots with no product or no number aren't
  constrained (SQLite treats NULLs as distinct). `down` drops the index and
  leaves the names.
  """
  use Ecto.Migration

  def up do
    execute(&rename_duplicates/0)

    create unique_index(:ingredient_lots, [:product_id, :lot_number],
             name: :ingredient_lots_product_id_lot_number_index
           )
  end

  def down do
    drop index(:ingredient_lots, [:product_id, :lot_number],
           name: :ingredient_lots_product_id_lot_number_index
         )
  end

  defp rename_duplicates do
    %{rows: rows} =
      repo().query!("""
      SELECT id, product_id, lot_number FROM ingredient_lots l
      WHERE product_id IS NOT NULL AND lot_number IS NOT NULL
        AND EXISTS (SELECT 1 FROM ingredient_lots o
                    WHERE o.product_id = l.product_id AND o.lot_number = l.lot_number
                      AND o.id < l.id)
      ORDER BY id
      """)

    for [id, product_id, number] <- rows do
      name = free_name(product_id, number, 2)

      repo().query!("UPDATE ingredient_lots SET lot_number = ? WHERE id = ?", [name, id])
    end
  end

  defp free_name(product_id, number, n) do
    name = "#{number} (#{n})"

    %{rows: [[taken]]} =
      repo().query!(
        "SELECT count(*) FROM ingredient_lots WHERE product_id = ? AND lot_number = ?",
        [product_id, name]
      )

    if taken == 0, do: name, else: free_name(product_id, number, n + 1)
  end
end
