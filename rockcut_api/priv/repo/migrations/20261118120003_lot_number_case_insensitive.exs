defmodule RockcutApi.Repo.Migrations.LotNumberCaseInsensitive do
  @moduledoc """
  D61 lead (Stop 1 note 4): a product's lot numbers are trimmed and unique
  in any case (`w123` is lot `W123`). Lot numbers are trimmed (blank becomes
  none), then numbers that now clash in any case are renamed as in
  `unique_lot_number_per_product`: the oldest lot (lowest id) keeps its
  spelling, the others get " (2)", " (3)" … (skipping a name the product
  already has in any case). The unique index becomes `(product_id,
  lot_number COLLATE NOCASE)`, under the same name (ecto_sqlite3 names a
  violation by its columns, so the changeset's `unique_constraint` matches
  only that name). Plain SQL. `down` puts the case-sensitive index back and
  leaves the names.
  """
  use Ecto.Migration

  @index "ingredient_lots_product_id_lot_number_index"

  def up do
    # The case-sensitive index goes first: trimming can make two numbers equal.
    execute("DROP INDEX IF EXISTS #{@index}")

    execute("""
    UPDATE ingredient_lots SET lot_number = NULLIF(trim(lot_number), '')
    WHERE lot_number IS NOT NULL
    """)

    execute(&rename_clashes/0)

    execute(
      "CREATE UNIQUE INDEX #{@index} ON ingredient_lots (product_id, lot_number COLLATE NOCASE)"
    )
  end

  def down do
    execute("DROP INDEX IF EXISTS #{@index}")
    execute("CREATE UNIQUE INDEX #{@index} ON ingredient_lots (product_id, lot_number)")
  end

  defp rename_clashes do
    %{rows: rows} =
      repo().query!("""
      SELECT id, product_id, lot_number FROM ingredient_lots l
      WHERE product_id IS NOT NULL AND lot_number IS NOT NULL
        AND EXISTS (SELECT 1 FROM ingredient_lots o
                    WHERE o.product_id = l.product_id
                      AND o.lot_number = l.lot_number COLLATE NOCASE
                      AND o.id < l.id)
      ORDER BY id
      """)

    for [id, product_id, number] <- rows do
      repo().query!("UPDATE ingredient_lots SET lot_number = ? WHERE id = ?", [
        free_name(product_id, number, 2),
        id
      ])
    end

    # A new name can clash with a later number in another case: go again.
    if rows != [], do: rename_clashes()
  end

  defp free_name(product_id, number, n) do
    name = "#{number} (#{n})"

    %{rows: [[taken]]} =
      repo().query!(
        "SELECT count(*) FROM ingredient_lots WHERE product_id = ? AND lot_number = ? COLLATE NOCASE",
        [product_id, name]
      )

    if taken == 0, do: name, else: free_name(product_id, number, n + 1)
  end
end
