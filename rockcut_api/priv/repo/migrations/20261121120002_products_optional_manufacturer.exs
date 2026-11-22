defmodule RockcutApi.Repo.Migrations.ProductsOptionalManufacturer do
  @moduledoc """
  D65 plan migration 5 (spec §2 decision 8): the manufacturer is optional on
  every D65 product (grain and hops still need one, `Product.changeset`), so
  `ingredient_products.manufacturer_party_id` becomes nullable. SQLite can't
  drop a NOT NULL in place, so the table is rebuilt as D62's
  `20261120140001` rebuilt `supplier_offers`: foreign keys off (dropping the
  old table must not cascade into `product_feature_values`, and the offers,
  lots and contract lines point at `ingredient_products` by name, so at the
  new table afterwards), every row copied with its id, then
  `foreign_key_check` must come back empty before the commit.

  SQLite treats NULLs in a unique index as distinct, so the unique index is
  on `coalesce(manufacturer_party_id, 0)`: a missing manufacturer is one
  value, and a second None "Calcium Sulfate (Gypsum) Powder" is a duplicate.

  `down` refuses while any product has no manufacturer: D62's image can't
  read one (rollback on prod needs the pre-release snapshot).
  """
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  @columns ~w(id ingredient_id manufacturer_party_id name notes active inserted_at updated_at
              min_on_hand_packs reorder_offer_id unit form origin lock_version)

  @unique "ingredient_products_ingredient_manufacturer_form_name_index"

  def up do
    in_transaction_without_fks(fn ->
      rebuild!(~s|"manufacturer_party_id" INTEGER|, "coalesce(manufacturer_party_id, 0)")
    end)
  end

  def down do
    case repo().query!(
           "SELECT id FROM ingredient_products WHERE manufacturer_party_id IS NULL ORDER BY id"
         ) do
      %{rows: []} ->
        :ok

      %{rows: rows} ->
        raise "Products #{Enum.map_join(rows, ", ", &hd/1)} have no manufacturer; " <>
                "D62 needs one on every product. Give them one, or restore the pre-release snapshot."
    end

    in_transaction_without_fks(fn ->
      rebuild!(~s|"manufacturer_party_id" INTEGER NOT NULL|, "manufacturer_party_id")
    end)
  end

  defp rebuild!(manufacturer_column, manufacturer_key) do
    cols = Enum.map_join(@columns, ", ", &~s|"#{&1}"|)

    repo().query!("""
    CREATE TABLE "ingredient_products_new" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "ingredient_id" INTEGER NOT NULL CONSTRAINT "ingredient_products_ingredient_id_fkey"
        REFERENCES "ingredients"("id") ON DELETE RESTRICT,
      #{manufacturer_column} CONSTRAINT "ingredient_products_maltster_party_id_fkey"
        REFERENCES "parties"("id") ON DELETE RESTRICT,
      "name" TEXT,
      "notes" TEXT,
      "active" INTEGER DEFAULT true NOT NULL,
      "inserted_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "min_on_hand_packs" INTEGER,
      "reorder_offer_id" INTEGER CONSTRAINT "ingredient_products_reorder_offer_id_fkey"
        REFERENCES "supplier_offers"("id") ON DELETE SET NULL,
      "unit" TEXT DEFAULT 'lb' NOT NULL,
      "form" TEXT,
      "origin" TEXT,
      "lock_version" INTEGER DEFAULT 1 NOT NULL
    )
    """)

    repo().query!(
      ~s|INSERT INTO "ingredient_products_new" (#{cols}) SELECT #{cols} FROM "ingredient_products"|
    )

    repo().query!(~s|DROP TABLE "ingredient_products"|)
    repo().query!(~s|ALTER TABLE "ingredient_products_new" RENAME TO "ingredient_products"|)

    repo().query!(
      ~s|CREATE INDEX "ingredient_products_reorder_offer_id_index" ON "ingredient_products" ("reorder_offer_id")|
    )

    repo().query!(
      ~s|CREATE INDEX "ingredient_products_manufacturer_party_id_index" ON "ingredient_products" ("manufacturer_party_id")|
    )

    repo().query!("""
    CREATE UNIQUE INDEX #{@unique} ON ingredient_products
      (ingredient_id, #{manufacturer_key}, coalesce(form, ''), coalesce(name, ''))
    """)
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
