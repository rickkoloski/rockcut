defmodule RockcutApi.Migrations.D65ProductsAndCategoriesTest do
  @moduledoc """
  D65 Stop 1 migrations run for real (plan migrations 3, 5 and 6):
  `ingredient_feature_values_and_formula`, `products_optional_manufacturer`
  (a table rebuild with foreign keys off, so like D62's
  `ProductLockVersionAndGrainOnlyOfferFormTest` this runs on a database
  file of its own, not in the sandbox) and `d65_categories`.

  The database starts shaped like D62 prod: grain and hop products with
  offers and prices, lots with movements, an order, a contract, a recipe
  line, a minimum and a reorder offer, standard features, the old
  categories (Future Ingredients, Other Consumables with Irish Moss and
  Whirlfloc, Corn Sugar (Dextrose)) and the old Form fields.
  """
  use ExUnit.Case, async: false

  alias RockcutApi.Repo

  @before 20_261_120_140_001
  @last 20_261_121_120_003
  @rebuild 20_261_121_120_002
  @now "2026-11-20T12:00:00Z"

  setup do
    path = Path.join(System.tmp_dir!(), "rockcut_d65_#{System.unique_integer([:positive])}.db")

    {:ok, pid} =
      Repo.start_link(
        name: nil,
        database: path,
        pool: DBConnection.ConnectionPool,
        pool_size: 1,
        log: false
      )

    previous = Repo.put_dynamic_repo(pid)

    on_exit(fn ->
      Repo.put_dynamic_repo(previous)
      for f <- [path, path <> "-wal", path <> "-shm"], do: File.rm(f)
    end)

    migrate(:up, to: @before)
    %{ids: d62_prod!()}
  end

  # As `ProductLockVersionAndGrainOnlyOfferFormTest`: the loaded modules.
  defp migrations do
    for file <-
          Path.wildcard(Application.app_dir(:rockcut_api, "priv/repo/migrations/*.exs"))
          |> Enum.sort() do
      [version | _] = file |> Path.basename() |> String.split("_", parts: 2)
      [_, name] = Regex.run(~r/defmodule\s+([\w.]+)/, File.read!(file))
      module = Module.concat([name])
      unless Code.ensure_loaded?(module), do: Code.require_file(file)
      {String.to_integer(version), module}
    end
  end

  defp migrate(direction, opts) do
    Ecto.Migrator.run(
      Repo,
      migrations(),
      direction,
      Keyword.merge([log: false, log_migrations_sql: false, log_migrator_sql: false], opts)
    )
  end

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

  defp rows(sql, params \\ []), do: Repo.query!(sql, params).rows

  defp d62_prod! do
    cat = fn name, key, extra ->
      insert!("ingredient_categories", Map.merge(%{"name" => name, "key" => key}, extra))
    end

    grains = cat.("Grains", "grains", %{"sort_order" => 0})
    future = cat.("Future Ingredients", "future", %{"sort_order" => 1})
    hops = cat.("Hops", "hops", %{"sort_order" => 2})
    fruits = cat.("Fruits", "fruits", %{"sort_order" => 4})
    spices = cat.("Spices & Flavorings", "spices", %{"sort_order" => 5})
    sugars = cat.("Sugars and Extracts", "sugars", %{"sort_order" => 6})
    consumables = cat.("Other Consumables", "consumables", %{"sort_order" => 7})
    base = insert!("ingredient_categories", %{"name" => "Base", "parent_id" => grains})

    for c <- [fruits, spices, sugars] do
      insert!("category_field_definitions", %{
        "category_id" => c,
        "field_name" => "Form",
        "field_type" => "dropdown",
        "options" => "A, B"
      })
    end

    yeast = cat.("Yeast Strains", "yeast", %{"sort_order" => 3})

    yeast_form =
      insert!("category_field_definitions", %{
        "category_id" => yeast,
        "field_name" => "Form",
        "field_type" => "dropdown"
      })

    rahr = insert!("parties", %{"name" => "Rahr"})
    bsg = insert!("parties", %{"name" => "BSG"})
    two_row = insert!("ingredients", %{"name" => "2-Row", "category_id" => base})
    citra = insert!("ingredients", %{"name" => "Citra", "category_id" => hops})
    insert!("ingredients", %{"name" => "Corn Sugar (Dextrose)", "category_id" => sugars})
    irish_moss = insert!("ingredients", %{"name" => "Irish Moss", "category_id" => consumables})
    whirlfloc = insert!("ingredients", %{"name" => "Whirlfloc", "category_id" => consumables})

    grain =
      insert!("ingredient_products", %{
        "ingredient_id" => two_row,
        "manufacturer_party_id" => rahr,
        "min_on_hand_packs" => 10
      })

    hop =
      insert!("ingredient_products", %{
        "ingredient_id" => citra,
        "manufacturer_party_id" => rahr,
        "form" => "T90 Pellet",
        "lock_version" => 4
      })

    feature =
      insert!("feature_types", %{"key" => "d65_test_feature", "label" => "Test"})

    insert!("product_feature_values", %{
      "product_id" => grain,
      "feature_type_id" => feature,
      "value" => 2
    })

    offer =
      insert!("supplier_offers", %{
        "product_id" => grain,
        "supplier_party_id" => bsg,
        "pack_name" => "sack",
        "pack_size" => 55,
        "form" => "milled"
      })

    insert!("supplier_offer_prices", %{
      "offer_id" => offer,
      "price_per_pack" => 48,
      "effective_on" => "2026-01-01"
    })

    rows("UPDATE ingredient_products SET reorder_offer_id = ? WHERE id = ?", [offer, grain])

    lot =
      insert!("ingredient_lots", %{
        "ingredient_id" => two_row,
        "product_id" => grain,
        "supplier_party_id" => bsg,
        "pack_size" => 55,
        "received_date" => "2026-11-19"
      })

    insert!("inventory_movements", %{
      "lot_id" => lot,
      "kind" => "opening",
      "quantity" => 110,
      "occurred_on" => "2026-11-19"
    })

    order =
      insert!("purchase_orders", %{"supplier_party_id" => bsg, "ordered_on" => "2026-11-19"})

    insert!("purchase_order_lines", %{
      "order_id" => order,
      "offer_id" => offer,
      "packs_ordered" => 2,
      "price_per_pack" => 48
    })

    contract = insert!("supplier_contracts", %{"supplier_party_id" => bsg, "year" => 2026})

    insert!("supplier_contract_lines", %{
      "contract_id" => contract,
      "product_id" => hop,
      "quantity" => 44,
      "price" => 15
    })

    brand = insert!("brands", %{"name" => "Pale"})
    recipe = insert!("recipes", %{"brand_id" => brand, "batch_size" => 15})

    insert!("recipe_ingredients", %{
      "recipe_id" => recipe,
      "lot_id" => lot,
      "amount" => 5,
      "unit" => "lb"
    })

    %{
      future: future,
      consumables: consumables,
      sugars: sugars,
      yeast_form: yeast_form,
      grain: grain,
      hop: hop,
      irish_moss: irish_moss,
      whirlfloc: whirlfloc,
      offer: offer,
      lot: lot,
      rahr: rahr,
      feature: feature
    }
  end

  # Everything the D62 data was, read back.
  defp snapshot do
    %{
      products:
        rows(
          "SELECT id, ingredient_id, manufacturer_party_id, name, form, unit, min_on_hand_packs, " <>
            "reorder_offer_id, lock_version FROM ingredient_products ORDER BY id"
        ),
      features: rows("SELECT product_id, value FROM product_feature_values"),
      offers: rows("SELECT id, product_id FROM supplier_offers"),
      prices: rows("SELECT offer_id FROM supplier_offer_prices"),
      lots: rows("SELECT id, product_id FROM ingredient_lots"),
      movements: rows("SELECT lot_id, quantity FROM inventory_movements"),
      order_lines: rows("SELECT offer_id FROM purchase_order_lines"),
      contract_lines: rows("SELECT product_id FROM supplier_contract_lines"),
      recipe_lines: rows("SELECT lot_id FROM recipe_ingredients"),
      categories: rows("SELECT name, key, parent_id FROM ingredient_categories ORDER BY id"),
      ingredients: rows("SELECT name, category_id FROM ingredients ORDER BY id"),
      fields: rows("SELECT category_id, field_name FROM category_field_definitions ORDER BY id")
    }
  end

  defp category(name),
    do: rows("SELECT id, parent_id FROM ingredient_categories WHERE name = ?", [name])

  test "everything D62 holds survives; the categories end as §4.1 says; a second run changes nothing",
       %{ids: ids} do
    before = snapshot()
    assert length(migrate(:up, to: @last)) == 3
    after_up = snapshot()

    for key <-
          ~w(products features offers prices lots movements order_lines contract_lines recipe_lines)a do
      assert after_up[key] == before[key], "#{key} changed"
    end

    assert rows("PRAGMA foreign_key_check") == []
    assert rows("PRAGMA foreign_keys") == [[1]]

    # The rebuilt table takes a product with no manufacturer, once.
    [[dextrose]] = rows("SELECT id FROM ingredients WHERE name = 'Dextrose (Corn Sugar)'")
    none = %{"ingredient_id" => dextrose, "form" => "Dry"}
    insert!("ingredient_products", none)
    assert_raise Exqlite.Error, ~r/UNIQUE/, fn -> insert!("ingredient_products", none) end

    # Foreign keys still point at the rebuilt table.
    assert_raise Exqlite.Error, ~r/FOREIGN KEY/, fn ->
      rows("DELETE FROM ingredient_products WHERE id = ?", [ids.grain])
    end

    # Migration 3: the ingredient's values and formula.
    insert!("ingredient_feature_values", %{
      "ingredient_id" => dextrose,
      "feature_type_id" => ids.feature,
      "value" => 1
    })

    rows("UPDATE ingredients SET formula = 'C6H12O6' WHERE id = ?", [dextrose])

    # Migration 6.
    assert [[water_salts, consumables]] = category("Water Salts")
    assert [[finings, ^consumables]] = category("Finings")
    assert consumables == ids.consumables
    assert category("Acids") == []
    assert category("Future Ingredients") == []
    assert rows("SELECT category_id FROM ingredients WHERE name = 'Whirlfloc'") == [[finings]]
    assert rows("SELECT count(*) FROM ingredients WHERE name = 'Irish Moss'") == [[0]]
    assert rows("SELECT count(*) FROM ingredients WHERE name = 'Corn Sugar (Dextrose)'") == [[0]]

    assert rows("SELECT id FROM category_field_definitions WHERE field_name = 'Form'") ==
             [[ids.yeast_form]]

    assert water_salts != finings

    # A second run of the rebuild and the categories changes nothing.
    settled = snapshot()

    Repo.query!("DELETE FROM schema_migrations WHERE version IN (?, ?)", [@rebuild, @last])
    assert length(migrate(:up, to: @last)) == 2
    assert snapshot() == settled
    assert rows("PRAGMA foreign_key_check") == []
  end

  test "Irish Moss with a recipe line, a non-empty Future Ingredients and a stray consumable are kept",
       %{ids: ids} do
    moss_lot =
      insert!("ingredient_lots", %{"ingredient_id" => ids.irish_moss, "pack_size" => 1})

    # D65's stop names lots with no product; this one gets a product first.
    moss_product =
      insert!("ingredient_products", %{
        "ingredient_id" => ids.irish_moss,
        "manufacturer_party_id" => ids.rahr
      })

    rows("UPDATE ingredient_lots SET product_id = ? WHERE id = ?", [moss_product, moss_lot])
    [[recipe]] = rows("SELECT id FROM recipes")

    insert!("recipe_ingredients", %{
      "recipe_id" => recipe,
      "lot_id" => moss_lot,
      "amount" => 1,
      "unit" => "oz"
    })

    insert!("ingredients", %{"name" => "Hop Bags", "category_id" => ids.future})
    insert!("ingredients", %{"name" => "Gelatin", "category_id" => ids.consumables})

    log = ExUnit.CaptureLog.capture_log(fn -> migrate(:up, to: @last) end)

    assert rows("SELECT category_id FROM ingredients WHERE name = 'Irish Moss'") == [
             [ids.consumables]
           ]

    assert [[_, nil]] = category("Future Ingredients")

    assert rows("SELECT category_id FROM ingredients WHERE name = 'Gelatin'") == [
             [ids.consumables]
           ]

    assert log =~ "kept ingredient Irish Moss"
    assert log =~ "kept category Future Ingredients: ingredients Hop Bags"
    assert log =~ "kept ingredient Gelatin at the top of Other Consumables"
  end

  test "a D65 lot with no product stops the migration, naming it", %{ids: ids} do
    insert!("ingredient_lots", %{"ingredient_id" => ids.whirlfloc, "lot_number" => "WF-1"})

    assert_raise RuntimeError, ~r/these lots have no product.*Whirlfloc lot WF-1/, fn ->
      migrate(:up, to: @last)
    end

    assert category("Water Salts") == []
  end

  test "down: refused while a product has no manufacturer; otherwise D62's shape again", %{
    ids: ids
  } do
    migrate(:up, to: @last)
    [[dextrose]] = rows("SELECT id FROM ingredients WHERE name = 'Dextrose (Corn Sugar)'")
    none = insert!("ingredient_products", %{"ingredient_id" => dextrose, "form" => "Dry"})

    assert [_] = migrate(:down, step: 1)

    assert_raise RuntimeError, ~r/Products #{none} have no manufacturer/, fn ->
      migrate(:down, step: 1)
    end

    rows("DELETE FROM ingredient_products WHERE id = ?", [none])
    assert [_] = migrate(:down, step: 1)

    assert rows(
             "SELECT \"notnull\" FROM pragma_table_info('ingredient_products') WHERE name = 'manufacturer_party_id'"
           ) ==
             [[1]]

    assert [[_, nil]] = category("Future Ingredients")
    assert rows("SELECT count(*) FROM ingredients WHERE name = 'Corn Sugar (Dextrose)'") == [[1]]

    assert rows("SELECT category_id FROM ingredients WHERE name = 'Whirlfloc'") == [
             [ids.consumables]
           ]

    assert category("Finings") == []
    assert rows("PRAGMA foreign_key_check") == []
  end
end
