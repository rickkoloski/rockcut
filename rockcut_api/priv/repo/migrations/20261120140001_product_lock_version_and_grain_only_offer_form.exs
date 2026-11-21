defmodule RockcutApi.Repo.Migrations.ProductLockVersionAndGrainOnlyOfferForm do
  @moduledoc """
  D62 lead decisions 1.

    * Gap 9: `ingredient_products.lock_version` (D61's pattern for orders
      and contracts): a product save from an older version is refused.
      Additive, default 1.
    * Gap 3: `supplier_offers.form` (milled/whole) is grain's alone; every
      other offer's is null, so the column becomes nullable and non-grain
      offers (the hop offers, all "whole" so far) are set to null. SQLite
      can't drop a NOT NULL in place, so the table is rebuilt
      (sqlite.org/lang_altertable.html, "other kinds of changes") with
      foreign keys off: dropping the old table must not cascade into
      `supplier_offer_prices` (ON DELETE CASCADE), and the order lines,
      contract lines and products' reorder offer point at `supplier_offers`
      by name, so at the new table afterwards. `foreign_key_check` must come
      back empty before the commit (as D47's batches rebuild).

  `down` gives every null form "whole" (what they were) and puts the NOT
  NULL back, then drops `lock_version`.
  """
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  @columns ~w(id product_id supplier_party_id order_name pack_size form notes active
              inserted_at updated_at pack_name)

  @grain_products """
  SELECT p.id FROM ingredient_products p
  JOIN ingredients i ON i.id = p.ingredient_id
  JOIN ingredient_categories c ON c.id = i.category_id
  LEFT JOIN ingredient_categories cp ON cp.id = c.parent_id
  WHERE c.key = 'grains' OR cp.key = 'grains'
  """

  def up do
    in_transaction_without_fks(fn ->
      repo().query!(
        ~s|ALTER TABLE "ingredient_products" ADD COLUMN "lock_version" INTEGER DEFAULT 1 NOT NULL|
      )

      rebuild_offers!(~s|"form" TEXT|)

      repo().query!(
        "UPDATE supplier_offers SET form = NULL WHERE product_id NOT IN (#{@grain_products})"
      )
    end)
  end

  def down do
    in_transaction_without_fks(fn ->
      repo().query!("UPDATE supplier_offers SET form = 'whole' WHERE form IS NULL")
      rebuild_offers!(~s|"form" TEXT NOT NULL|)
      repo().query!(~s|ALTER TABLE "ingredient_products" DROP COLUMN "lock_version"|)
    end)
  end

  defp rebuild_offers!(form_column) do
    cols = Enum.map_join(@columns, ", ", &~s|"#{&1}"|)

    repo().query!("""
    CREATE TABLE "supplier_offers_new" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "product_id" INTEGER NOT NULL CONSTRAINT "supplier_offers_product_id_fkey"
        REFERENCES "ingredient_products"("id") ON DELETE RESTRICT,
      "supplier_party_id" INTEGER NOT NULL CONSTRAINT "supplier_offers_supplier_party_id_fkey"
        REFERENCES "parties"("id") ON DELETE RESTRICT,
      "order_name" TEXT,
      "pack_size" DECIMAL NOT NULL,
      #{form_column},
      "notes" TEXT,
      "active" INTEGER DEFAULT true NOT NULL,
      "inserted_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "pack_name" TEXT DEFAULT 'sack' NOT NULL
    )
    """)

    repo().query!(
      ~s|INSERT INTO "supplier_offers_new" (#{cols}) SELECT #{cols} FROM "supplier_offers"|
    )

    repo().query!(~s|DROP TABLE "supplier_offers"|)
    repo().query!(~s|ALTER TABLE "supplier_offers_new" RENAME TO "supplier_offers"|)

    repo().query!(
      ~s|CREATE INDEX "supplier_offers_product_id_index" ON "supplier_offers" ("product_id")|
    )

    repo().query!(
      ~s|CREATE INDEX "supplier_offers_supplier_party_id_index" ON "supplier_offers" ("supplier_party_id")|
    )
  end

  defp in_transaction_without_fks(fun) do
    repo().checkout(fn ->
      repo().query!("PRAGMA foreign_keys = OFF")

      try do
        {:ok, _} =
          repo().transaction(fn ->
            fun.()

            case repo().query!("PRAGMA foreign_key_check") do
              %{rows: []} -> :ok
              %{rows: rows} -> raise "foreign_key_check failed: #{inspect(rows)}"
            end
          end)
      after
        repo().query!("PRAGMA foreign_keys = ON")
      end
    end)
  end
end
