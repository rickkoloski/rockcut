defmodule RockcutApi.Migrations.PacksUnitsAndManufacturerTest do
  @moduledoc """
  D62 Stage 1 (`add_key_to_ingredient_categories`,
  `packs_units_and_manufacturer`) run for real on a database shaped like
  D61's: down to before both, a grain catalog with a product, an offer and
  its price history, lots with movements and a cost, an order received, a
  contract and a person who chose the `sacks` display are written under the
  old names (plain SQL); up again, every value is there under its new name,
  the roles and the setting are migrated, and the indexes are back. Down
  once more puts the old names back. Run inside the test's transaction
  (SQLite's DDL is transactional).
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures

  @keys_version 20_261_119_130_001
  @keys RockcutApi.Repo.Migrations.AddKeyToIngredientCategories
  @packs_version 20_261_119_130_002
  @packs RockcutApi.Repo.Migrations.PacksUnitsAndManufacturer

  setup_all do
    Code.require_file("priv/repo/migrations/20261119130001_add_key_to_ingredient_categories.exs")
    Code.require_file("priv/repo/migrations/20261119130002_packs_units_and_manufacturer.exs")
    :ok
  end

  defp down do
    assert :ok = Ecto.Migrator.down(Repo, @packs_version, @packs, log: false)
    assert :ok = Ecto.Migrator.down(Repo, @keys_version, @keys, log: false)
  end

  defp up do
    assert :ok = Ecto.Migrator.up(Repo, @keys_version, @keys, log: false)
    assert :ok = Ecto.Migrator.up(Repo, @packs_version, @packs, log: false)
  end

  @now "2026-11-19T12:00:00Z"

  # INSERT under the given column names; the new row's id.
  defp insert!(table, row) do
    row = Map.merge(%{"inserted_at" => @now, "updated_at" => @now}, row)
    columns = Map.keys(row)

    Repo.query!(
      "INSERT INTO #{table} (#{Enum.join(columns, ", ")}) VALUES " <>
        "(#{Enum.map_join(columns, ", ", fn _ -> "?" end)})",
      Enum.map(columns, &Map.fetch!(row, &1))
    )

    %{rows: [[id]]} = Repo.query!("SELECT last_insert_rowid()")
    id
  end

  defp row(table, id, columns) do
    %{rows: [values]} =
      Repo.query!("SELECT #{Enum.join(columns, ", ")} FROM #{table} WHERE id = ?", [id])

    columns |> Enum.zip(values) |> Map.new()
  end

  defp columns(table) do
    Repo.query!("SELECT name FROM pragma_table_info('#{table}')").rows |> List.flatten()
  end

  defp indexes(table) do
    Repo.query!("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?", [table]).rows
    |> List.flatten()
  end

  defp num(v), do: Decimal.new(to_string(v))

  test "a D61 database keeps every value under its new name; down puts the old names back" do
    owner = user_fixture()
    other = user_fixture()
    down()

    grains = insert!("ingredient_categories", %{"name" => "Grains", "sort_order" => 0})
    hops = insert!("ingredient_categories", %{"name" => "Hops", "sort_order" => 1})
    renamed = insert!("ingredient_categories", %{"name" => "Fruit (renamed)", "sort_order" => 2})

    base =
      insert!("ingredient_categories", %{
        "name" => "Base",
        "sort_order" => 0,
        "parent_id" => grains
      })

    two_row = insert!("ingredients", %{"name" => "2-Row", "category_id" => base})
    rahr = insert!("parties", %{"name" => "Rahr", "active" => true})
    bsg = insert!("parties", %{"name" => "BSG", "active" => true, "order_target_sacks" => 40})
    insert!("party_roles", %{"party_id" => rahr, "role" => "maltster"})
    insert!("party_roles", %{"party_id" => bsg, "role" => "supplier"})

    product =
      insert!("ingredient_products", %{
        "ingredient_id" => two_row,
        "maltster_party_id" => rahr,
        "active" => true,
        "min_on_hand_sacks" => 12
      })

    offer =
      insert!("supplier_offers", %{
        "product_id" => product,
        "supplier_party_id" => bsg,
        "sack_size_lb" => 55,
        "form" => "milled",
        "active" => true
      })

    price =
      insert!("supplier_offer_prices", %{
        "offer_id" => offer,
        "price_per_sack" => "48.5",
        "effective_on" => "2026-01-01"
      })

    lot =
      insert!("ingredient_lots", %{
        "ingredient_id" => two_row,
        "product_id" => product,
        "supplier_party_id" => bsg,
        "lot_number" => "A1",
        "received_date" => "2026-11-01",
        "status" => "available",
        "sack_size_lb" => 55
      })

    opening =
      insert!("inventory_movements", %{
        "lot_id" => lot,
        "kind" => "opening",
        "quantity_lb" => "110.5",
        "occurred_on" => "2026-11-01"
      })

    order =
      insert!("purchase_orders", %{
        "supplier_party_id" => bsg,
        "ordered_on" => "2026-11-10",
        "status" => "received",
        "received_on" => "2026-11-12",
        "off_contract" => false
      })

    line =
      insert!("purchase_order_lines", %{
        "order_id" => order,
        "offer_id" => offer,
        "sacks_ordered" => 10,
        "sacks_received" => 9,
        "price_per_sack" => "47.25"
      })

    receipt =
      insert!("inventory_movements", %{
        "lot_id" => lot,
        "kind" => "received",
        "quantity_lb" => 495,
        "occurred_on" => "2026-11-12",
        "purchase_order_line_id" => line,
        "unit_cost_per_lb" => "0.859091"
      })

    contract =
      insert!("supplier_contracts", %{"supplier_party_id" => bsg, "year" => 2026})

    contract_line =
      insert!("supplier_contract_lines", %{
        "contract_id" => contract,
        "product_id" => product,
        "offer_id" => offer,
        "sacks" => 200,
        "price_per_sack" => "46.00"
      })

    Repo.query!("UPDATE users SET board_settings = ? WHERE id = ?", [
      ~s({"ingredients":{"quantity_display":"sacks"},"brewery":{"span":7}}),
      owner.id
    ])

    Repo.query!("UPDATE users SET board_settings = ? WHERE id = ?", [
      ~s({"ingredients":{"quantity_display":"lb"}}),
      other.id
    ])

    up()

    # Keys by name, top level only; a category no longer named as seeded has none.
    keys =
      Repo.query!("SELECT id, key FROM ingredient_categories").rows
      |> Map.new(fn [id, key] -> {id, key} end)

    assert keys[grains] == "grains" and keys[hops] == "hops"
    assert keys[base] == nil and keys[renamed] == nil

    assert %{"order_target_packs" => 40} = row("parties", bsg, ["order_target_packs"])

    assert %{
             "manufacturer_party_id" => ^rahr,
             "min_on_hand_packs" => 12,
             "unit" => "lb",
             "form" => nil,
             "origin" => nil
           } =
             row("ingredient_products", product, [
               "manufacturer_party_id",
               "min_on_hand_packs",
               "unit",
               "form",
               "origin"
             ])

    o = row("supplier_offers", offer, ["pack_name", "pack_size", "form"])
    assert o["pack_name"] == "sack" and Decimal.eq?(num(o["pack_size"]), 55)
    assert o["form"] == "milled"

    assert Decimal.eq?(
             num(row("supplier_offer_prices", price, ["price_per_pack"])["price_per_pack"]),
             "48.5"
           )

    l = row("ingredient_lots", lot, ["pack_name", "pack_size", "lot_number"])
    assert l["pack_name"] == "sack" and Decimal.eq?(num(l["pack_size"]), 55)
    assert l["lot_number"] == "A1"

    assert Decimal.eq?(
             num(row("inventory_movements", opening, ["quantity"])["quantity"]),
             "110.5"
           )

    r = row("inventory_movements", receipt, ["quantity", "unit_cost", "purchase_order_line_id"])
    assert Decimal.eq?(num(r["quantity"]), 495) and Decimal.eq?(num(r["unit_cost"]), "0.859091")
    assert r["purchase_order_line_id"] == line

    pl = row("purchase_order_lines", line, ["packs_ordered", "packs_received", "price_per_pack"])
    assert pl["packs_ordered"] == 10 and pl["packs_received"] == 9
    assert Decimal.eq?(num(pl["price_per_pack"]), "47.25")

    cl = row("supplier_contract_lines", contract_line, ["quantity", "price", "offer_id"])
    assert cl["quantity"] == 200 and Decimal.eq?(num(cl["price"]), "46.00")
    assert cl["offer_id"] == offer

    assert Repo.query!("SELECT party_id, role FROM party_roles ORDER BY party_id").rows ==
             [[rahr, "manufacturer"], [bsg, "supplier"]]

    # The setting: sacks → packs, lb stays, other boards untouched.
    assert Repo.reload!(owner).board_settings == %{
             "ingredients" => %{"quantity_display" => "packs"},
             "brewery" => %{"span" => 7}
           }

    assert Repo.reload!(other).board_settings == %{"ingredients" => %{"quantity_display" => "lb"}}

    # No old column is left, and the indexes are there under their new names.
    old = ~w(sack_size_lb quantity_lb unit_cost_per_lb order_target_sacks min_on_hand_sacks
             maltster_party_id sacks_ordered sacks_received price_per_sack sacks)

    for table <- ~w(supplier_offers ingredient_lots inventory_movements parties
                    ingredient_products purchase_order_lines supplier_offer_prices
                    supplier_contract_lines),
        do: assert(columns(table) -- old == columns(table), "#{table} keeps an old column")

    assert "ingredient_products_ingredient_manufacturer_form_name_index" in indexes(
             "ingredient_products"
           )

    assert "ingredient_products_manufacturer_party_id_index" in indexes("ingredient_products")
    assert "ingredient_categories_key_index" in indexes("ingredient_categories")
    assert "ingredient_lots_product_id_lot_number_index" in indexes("ingredient_lots")
    assert "inventory_movements_purchase_order_line_id_index" in indexes("inventory_movements")

    # The unique index includes the form: one unnamed grain product per maker...
    assert_raise Exqlite.Error, fn ->
      insert!("ingredient_products", %{
        "ingredient_id" => two_row,
        "manufacturer_party_id" => rahr,
        "active" => true
      })
    end

    # ...and a second form of it is a different product.
    insert!("ingredient_products", %{
      "ingredient_id" => two_row,
      "manufacturer_party_id" => rahr,
      "form" => "Whole",
      "active" => true
    })

    Repo.query!("DELETE FROM ingredient_products WHERE form = 'Whole'")

    # Down: the old names and the old setting are back.
    down()

    assert "maltster_party_id" in columns("ingredient_products")
    assert "sack_size_lb" in columns("supplier_offers")
    assert "sacks" in columns("supplier_contract_lines")
    refute "key" in columns("ingredient_categories")
    assert row("parties", bsg, ["order_target_sacks"])["order_target_sacks"] == 40

    assert Repo.query!("SELECT role FROM party_roles WHERE party_id = ?", [rahr]).rows == [
             ["maltster"]
           ]

    assert Repo.reload!(owner).board_settings["ingredients"] == %{"quantity_display" => "sacks"}
    assert "ingredient_products_ingredient_maltster_name_index" in indexes("ingredient_products")

    up()
  end
end
