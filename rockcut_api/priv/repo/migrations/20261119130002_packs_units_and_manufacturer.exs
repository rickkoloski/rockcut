defmodule RockcutApi.Repo.Migrations.PacksUnitsAndManufacturer do
  @moduledoc """
  D62 §3.2, §3.3, §3.5 (plan, Stage 1): D60/D61's grain-only names become
  the general ones. Sacks are one kind of pack, lb is one product unit, and
  the maltster is a manufacturer.

    * Columns renamed (`ALTER TABLE … RENAME COLUMN`, which carries indexes
      and foreign keys along): sack sizes → `pack_size`, `quantity_lb` →
      `quantity`, `unit_cost_per_lb` → `unit_cost`, the order and minimum
      sacks → packs, `price_per_sack` → `price_per_pack`, contract lines'
      `sacks`/`price_per_sack` → `quantity`/`price`, and
      `maltster_party_id` → `manufacturer_party_id`.
    * New: `pack_name` on offers and lots (`sack` for every row), and the
      product's `unit` (`lb` for every row), `form` and `origin`.
    * The product's unique index now includes the form (§3.3) and the two
      product indexes are renamed for the manufacturer (SQLite can't rename
      an index: dropped and created).
    * `party_roles` `maltster` → `manufacturer`; a person's ingredient
      quantity display `sacks` → `packs` (`lb` stays: "total in unit").

  `supplier_contract_lines.quantity` keeps its INTEGER declaration: SQLite
  stores 440.5 in it as it would in a DECIMAL column (both are numeric
  affinity), so Stage 2's decimal hop lines change only the schema type.

  Rollback needs the pre-release snapshot on prod (plan, Release); `down`
  is for local and tests.
  """
  use Ecto.Migration

  @renames [
    {:supplier_offers, :sack_size_lb, :pack_size},
    {:ingredient_lots, :sack_size_lb, :pack_size},
    {:inventory_movements, :quantity_lb, :quantity},
    {:inventory_movements, :unit_cost_per_lb, :unit_cost},
    {:parties, :order_target_sacks, :order_target_packs},
    {:ingredient_products, :min_on_hand_sacks, :min_on_hand_packs},
    {:ingredient_products, :maltster_party_id, :manufacturer_party_id},
    {:purchase_order_lines, :sacks_ordered, :packs_ordered},
    {:purchase_order_lines, :sacks_received, :packs_received},
    {:purchase_order_lines, :price_per_sack, :price_per_pack},
    {:supplier_offer_prices, :price_per_sack, :price_per_pack},
    {:supplier_contract_lines, :sacks, :quantity},
    {:supplier_contract_lines, :price_per_sack, :price}
  ]

  @old_unique "ingredient_products_ingredient_maltster_name_index"
  @new_unique "ingredient_products_ingredient_manufacturer_form_name_index"

  def up do
    for {table, from, to} <- @renames, do: rename(table(table), from, to: to)

    alter table(:supplier_offers) do
      add :pack_name, :string, null: false, default: "sack"
    end

    alter table(:ingredient_lots) do
      add :pack_name, :string, null: false, default: "sack"
    end

    alter table(:ingredient_products) do
      add :unit, :string, null: false, default: "lb"
      add :form, :string
      add :origin, :string
    end

    execute("DROP INDEX IF EXISTS #{@old_unique}")
    execute("DROP INDEX IF EXISTS ingredient_products_maltster_party_id_index")
    create index(:ingredient_products, [:manufacturer_party_id])

    execute("""
    CREATE UNIQUE INDEX #{@new_unique} ON ingredient_products
      (ingredient_id, manufacturer_party_id, coalesce(form, ''), coalesce(name, ''))
    """)

    execute("UPDATE party_roles SET role = 'manufacturer' WHERE role = 'maltster'")
    execute(quantity_display("sacks", "packs"))
  end

  def down do
    execute(quantity_display("packs", "sacks"))
    execute("UPDATE party_roles SET role = 'maltster' WHERE role = 'manufacturer'")

    execute("DROP INDEX IF EXISTS #{@new_unique}")
    drop index(:ingredient_products, [:manufacturer_party_id])

    alter table(:ingredient_products) do
      remove :origin
      remove :form
      remove :unit
    end

    alter table(:ingredient_lots) do
      remove :pack_name
    end

    alter table(:supplier_offers) do
      remove :pack_name
    end

    for {table, from, to} <- Enum.reverse(@renames), do: rename(table(table), to, to: from)

    execute(
      "CREATE INDEX ingredient_products_maltster_party_id_index " <>
        "ON ingredient_products (maltster_party_id)"
    )

    execute("""
    CREATE UNIQUE INDEX #{@old_unique} ON ingredient_products
      (ingredient_id, maltster_party_id, coalesce(name, ''))
    """)
  end

  # D60 §3.9's setting, kept in `users.board_settings` under "ingredients".
  defp quantity_display(from, to) do
    """
    UPDATE users
    SET board_settings = json_set(board_settings, '$.ingredients.quantity_display', '#{to}')
    WHERE json_valid(board_settings)
      AND json_extract(board_settings, '$.ingredients.quantity_display') = '#{from}'
    """
  end
end
