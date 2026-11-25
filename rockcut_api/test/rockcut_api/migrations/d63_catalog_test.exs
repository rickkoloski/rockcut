defmodule RockcutApi.Migrations.D63CatalogTest do
  @moduledoc """
  D63 §5: the four catalog migrations and the seeds, run for real on a
  database file of its own (as `D65ProductsAndCategoriesTest`). It starts
  from D64's data: the seeds as D64 released them (`test/support/fixtures/
  d64_seeds`), run before the D63 migrations.

    * migrations, then the seeds twice: the old rows don't come back, nothing
      doubles, the second run adds 0;
    * a fresh database ends with the same catalog;
    * every value changed by hand first is left alone;
    * every refusal (a duplicate, lots, lines, unexpected rows) and what the
      seeds do after it.
  """
  use ExUnit.Case, async: false

  import ExUnit.CaptureIO
  import ExUnit.CaptureLog

  alias RockcutApi.Repo
  alias RockcutApi.Ingredients.{Inventory, Product}

  @moduletag :capture_log

  @versions [20_261_124_120_001, 20_261_124_120_002, 20_261_124_120_003, 20_261_124_120_004]
  @now "2026-11-23T12:00:00Z"

  # {ingredient, maker, feature, old, new, high}
  @values [
    {"Pilsner", "Root Shoot", "moisture_pct", 5.0, 3.93, nil},
    {"Pilsner", "Root Shoot", "extract_fgdb", 80.8, 81.5, nil},
    {"Pilsner", "Root Shoot", "color_lovibond", 1.6, 1.85, nil},
    {"Pilsner", "Root Shoot", "protein_pct", 10.5, 11.62, nil},
    {"Pilsner", "Root Shoot", "diastatic_power_lintner", 125, 157, nil},
    {"Acidulated", "Weyermann", "extract_fgdb", nil, 84.9, nil},
    {"Oats, Flaked", "Grain Millers", "extract_fgdb", nil, 81.5, nil},
    {"DME", "Muntons", "extract_fgdb", 100, 96, nil},
    {"Dextrose (Corn Sugar)", nil, "extract_fgdb", 91, 91.3, nil},
    {"Lime", nil, "brix", nil, 8, 8}
  ]

  setup do
    path = Path.join(System.tmp_dir!(), "rockcut_d63_#{System.unique_integer([:positive])}.db")

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

    # Every migration on an empty database: nothing to change, nothing logged.
    log = capture_log(fn -> Ecto.Migrator.run(Repo, migrations(), :up, opts(all: true)) end)
    refute log =~ "D63:"
    assert rows("SELECT count(*) FROM ingredients") == [[0]]
    :ok
  end

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

  defp opts(extra),
    do: Keyword.merge([log: false, log_migrations_sql: false, log_migrator_sql: false], extra)

  # D64's data: the four taken down (they change nothing), then D64's seeds.
  defp d64! do
    down!()
    capture_io(fn -> Code.eval_file("test/support/fixtures/d64_seeds/seeds.exs") end)
  end

  defp down! do
    for {v, m} <- migrations(), v in @versions, do: :ok = Ecto.Migrator.down(Repo, v, m, opts([]))
  end

  # The four migrations; what they logged.
  defp up! do
    capture_log(fn ->
      for {v, m} <- migrations(), v in @versions, do: :ok = Ecto.Migrator.up(Repo, v, m, opts([]))
    end)
  end

  # The seeds; D63's line of what they printed.
  defp seed! do
    out = capture_io(fn -> capture_log(fn -> Code.eval_file("priv/repo/seeds.exs") end) end)
    out |> String.split("\n") |> Enum.find(&String.starts_with?(&1, "D63 reference"))
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
  defp one(sql, params), do: rows(sql, params) |> then(fn [[v]] -> v end)

  # Row counts of everything the catalog is in.
  defp counts do
    for t <- ~w(ingredient_categories ingredients parties party_roles ingredient_products
              product_feature_values ingredient_feature_values supplier_offers
              supplier_offer_prices ingredient_lots lot_feature_values inventory_movements),
        into: %{},
        do: {t, rows("SELECT count(*) FROM #{t}") |> hd() |> hd()}
  end

  # The whole catalog by name: what two databases must agree on.
  defp catalog do
    %{
      categories:
        rows("""
        SELECT c.name, c.key, p.name FROM ingredient_categories c
        LEFT JOIN ingredient_categories p ON p.id = c.parent_id ORDER BY 1
        """),
      ingredients:
        rows("""
        SELECT c.name, i.name, i.formula FROM ingredients i
        JOIN ingredient_categories c ON c.id = i.category_id ORDER BY 1, 2
        """),
      products:
        rows("""
        SELECT i.name, m.name, p.form, p.unit, p.name, p.origin FROM ingredient_products p
        JOIN ingredients i ON i.id = p.ingredient_id
        LEFT JOIN parties m ON m.id = p.manufacturer_party_id ORDER BY 1, 2, 3, 5
        """),
      values:
        rows("""
        SELECT i.name, m.name, p.form, p.name, f.key, v.value, v.value_high
        FROM product_feature_values v
        JOIN feature_types f ON f.id = v.feature_type_id
        JOIN ingredient_products p ON p.id = v.product_id
        JOIN ingredients i ON i.id = p.ingredient_id
        LEFT JOIN parties m ON m.id = p.manufacturer_party_id ORDER BY 1, 2, 3, 4, 5
        """),
      offers:
        rows("""
        SELECT i.name, s.name, o.order_name, o.pack_name, o.pack_size, o.pack_note, o.form,
          (SELECT group_concat(price_per_pack || '@' || effective_on) FROM supplier_offer_prices x
           WHERE x.offer_id = o.id AND i.name NOT LIKE '[SEED]%')
        FROM supplier_offers o
        JOIN ingredient_products p ON p.id = o.product_id
        JOIN ingredients i ON i.id = p.ingredient_id
        JOIN parties s ON s.id = o.supplier_party_id ORDER BY 1, 2, 4, 5
        """),
      lots:
        rows("""
        SELECT i.name, l.lot_number, l.crop_year, l.notes, pi.name,
          (SELECT sum(m.quantity) FROM inventory_movements m WHERE m.lot_id = l.id)
        FROM ingredient_lots l
        JOIN ingredients i ON i.id = l.ingredient_id
        JOIN ingredient_products p ON p.id = l.product_id
        JOIN ingredients pi ON pi.id = p.ingredient_id ORDER BY 1, 2
        """)
    }
  end

  defp product_id(ingredient, maker, form \\ nil) do
    ids =
      rows(
        """
        SELECT p.id FROM ingredient_products p
        JOIN ingredients i ON i.id = p.ingredient_id
        LEFT JOIN parties m ON m.id = p.manufacturer_party_id
        WHERE i.name = ? AND coalesce(m.name, '') = ? AND (? IS NULL OR p.form = ?)
        """,
        [ingredient, maker || "", form, form]
      )

    assert [[id]] = ids
    id
  end

  defp value(ingredient, maker, feature) do
    case rows(
           "SELECT v.value, v.value_high FROM product_feature_values v " <>
             "JOIN feature_types f ON f.id = v.feature_type_id WHERE v.product_id = ? AND f.key = ?",
           [product_id(ingredient, maker), feature]
         ) do
      [[v, h]] -> {v, h}
      [] -> nil
    end
  end

  defp set_value!(ingredient, maker, feature, v, high \\ nil) do
    id = product_id(ingredient, maker)
    type = one("SELECT id FROM feature_types WHERE key = ?", [feature])

    Repo.query!(
      "DELETE FROM product_feature_values WHERE product_id = ? AND feature_type_id = ?",
      [id, type]
    )

    insert!("product_feature_values", %{
      "product_id" => id,
      "feature_type_id" => type,
      "value" => v,
      "value_high" => high
    })
  end

  defp hop(name),
    do:
      rows(
        "SELECT i.id FROM ingredients i JOIN ingredient_categories c ON c.id = i.category_id " <>
          "WHERE c.key = 'hops' AND i.name = ?",
        [name]
      )

  defp pink do
    rows("""
    SELECT i.name, l.lot_number, (SELECT sum(quantity) FROM inventory_movements m WHERE m.lot_id = l.id)
    FROM ingredient_lots l JOIN ingredients i ON i.id = l.ingredient_id
    WHERE l.lot_number LIKE 'P92-_UPBB%' ORDER BY 2
    """)
  end

  @blend [["Pink Boots Blend", "P92-IUPBB3182", 8.5], ["Pink Boots Blend", "P92-JUPBB4199", 2.9]]
  @split [["Pink Boots '23", "P92-IUPBB3182", 8.5], ["Pink Boots '24", "P92-JUPBB4199", 2.9]]

  describe "from D64's data" do
    test "the migrations, then the seeds twice: nothing comes back, nothing doubles, the second adds 0" do
      d64!()

      assert rows("SELECT name FROM ingredient_categories WHERE name = 'Finings'") == [
               ["Finings"]
             ]

      assert pink() == @blend
      before = counts()

      # Every row is as D64 left it, so nothing is skipped or left.
      refute up!() =~ "D63:"

      migrated = counts()
      # Pink Boots '24: an ingredient, a product, an offer. Three values that were none.
      assert migrated["ingredients"] == before["ingredients"] + 1
      assert migrated["ingredient_products"] == before["ingredient_products"] + 1
      assert migrated["supplier_offers"] == before["supplier_offers"] + 1
      assert migrated["product_feature_values"] == before["product_feature_values"] + 3

      for t <- ~w(ingredient_categories supplier_offer_prices ingredient_lots lot_feature_values
                inventory_movements parties),
          do: assert(migrated[t] == before[t], t)

      # Four process aids, Allspice, Chamomile and EKG; 4 + 7 + 1 products.
      assert seed!() ==
               "D63 reference: 1 new companies, 7 new ingredients, 12 new products, 5 new offers, 1 new lots"

      first = counts()
      first_catalog = catalog()

      assert seed!() ==
               "D63 reference: 0 new companies, 0 new ingredients, 0 new products, 0 new offers, 0 new lots"

      assert counts() == first
      assert catalog() == first_catalog

      assert rows("SELECT name FROM ingredient_categories WHERE lower(name) = 'finings'") == []
      assert hop("Pink Boots Blend") == []
      assert pink() == @split

      assert rows(
               "SELECT p.id FROM ingredient_products p JOIN ingredients i ON i.id = p.ingredient_id " <>
                 "WHERE i.name = 'Calcium Chloride (Hydrous)'"
             ) == []

      for {i, m, f, _old, new, high} <- @values do
        {v, h} = value(i, m, f)
        assert_in_delta v, new, 1.0e-9, "#{i} #{f}"
        assert h == high
      end

      # Lots keep what they copied: no lot value was touched (hops only, all theirs).
      assert first["ingredient_categories"] == before["ingredient_categories"]
    end

    test "the migrations again change nothing and log nothing; the API takes the corrected values" do
      d64!()
      up!()
      first = {counts(), catalog()}
      down!()
      refute up!() =~ "D63:"
      assert {counts(), catalog()} == first

      # The stored values read back as decimals.
      p =
        Repo.get!(Product, product_id("Pilsner", "Root Shoot"))
        |> Repo.preload(feature_values: :feature_type)

      moisture = Enum.find(p.feature_values, &(&1.feature_type.key == "moisture_pct"))
      assert Decimal.eq?(moisture.value, Decimal.new("3.93"))
      assert p.lock_version == 2
    end

    test "a fresh database ends with the same catalog, and its second run adds 0" do
      d64!()
      up!()
      seed!()
      seed!()
      from_d64 = catalog()

      # A second database, empty, every migration, the same seeds.
      path = Path.join(System.tmp_dir!(), "rockcut_d63_#{System.unique_integer([:positive])}.db")

      {:ok, pid} =
        Repo.start_link(
          name: nil,
          database: path,
          pool: DBConnection.ConnectionPool,
          pool_size: 1,
          log: false
        )

      old = Repo.put_dynamic_repo(pid)

      try do
        log = capture_log(fn -> Ecto.Migrator.run(Repo, migrations(), :up, opts(all: true)) end)
        refute log =~ "D63:"
        seed!()
        fresh = catalog()
        first = counts()

        assert seed!() ==
                 "D63 reference: 0 new companies, 0 new ingredients, 0 new products, 0 new offers, 0 new lots"

        assert counts() == first
        for {k, v} <- from_d64, do: assert(fresh[k] == v, "#{k}")
      after
        Repo.put_dynamic_repo(old)
        for f <- [path, path <> "-wal", path <> "-shm"], do: File.rm(f)
      end
    end

    test "the new rows: process aids, spices, EKG" do
      d64!()
      up!()
      seed!()
      %{products: products, offers: offers, lots: lots} = catalog()

      for row <- [
            ["Zinc Sulfate Heptahydrate", "BSG", "Powder", "g", nil, nil],
            ["Amylo300", "Kerry", "Liquid", "g", nil, nil],
            ["Clarity Ferm", "White Labs", "Liquid", "mL", nil, nil],
            ["Ultra-Ferm", "White Labs", "Liquid", "mL", nil, nil],
            ["Juniper Berries", nil, "Whole", "oz", nil, nil],
            ["Timut Pepper", nil, "Whole", "oz", nil, nil],
            ["Lemongrass", nil, "Whole", "oz", nil, nil],
            ["Chamomile", nil, "Whole", "oz", nil, nil],
            ["Cinnamon", nil, "Ground", "oz", nil, nil],
            ["Allspice", nil, "Ground", "oz", nil, nil],
            ["Clove", nil, "Ground", "oz", nil, nil],
            ["EKG", "Lupulin Exchange", "T90 Pellet", "lb", nil, nil]
          ],
          do: assert(row in products, inspect(row))

      for row <- [
            ["Zinc Sulfate Heptahydrate", "BSG", nil, "bag", 250, nil, nil, nil],
            ["Amylo300", "BSG", nil, "bottle", 1000, nil, nil, nil],
            ["Clarity Ferm", "White Labs", nil, "jug", 10_000, nil, nil, nil],
            ["Ultra-Ferm", "White Labs", nil, "bottle", 1000, nil, nil, nil],
            ["EKG", "Lupulin Exchange", "EKG", "box", 11, nil, nil, nil]
          ],
          do: assert(row in offers, inspect(row))

      refute Enum.any?(offers, &(hd(&1) in ["Cinnamon", "Allspice", "Chamomile", "Clove"]))

      assert [
               [
                 "EKG",
                 "EKG-2025",
                 2025,
                 "Placeholder: check the lot number, alpha and weight",
                 "EKG",
                 11
               ]
             ] =
               Enum.filter(lots, &(hd(&1) == "EKG"))

      assert rows("""
             SELECT f.key, v.value FROM lot_feature_values v
             JOIN feature_types f ON f.id = v.feature_type_id
             JOIN ingredient_lots l ON l.id = v.lot_id WHERE l.lot_number = 'EKG-2025'
             """) == [["alpha_acid_pct", 5.9]]

      assert [["Process Aids", "Whirlfloc"]] ==
               rows(
                 "SELECT c.name, i.name FROM ingredients i JOIN ingredient_categories c " <>
                   "ON c.id = i.category_id WHERE i.name = 'Whirlfloc'"
               )
    end

    test "a row already there is left: a lot on EKG, a product with its own unit, an offer" do
      d64!()
      up!()
      hops = one("SELECT id FROM ingredient_categories WHERE key = 'hops'", [])
      spices = one("SELECT id FROM ingredient_categories WHERE key = 'spices'", [])
      le = one("SELECT id FROM parties WHERE name = 'Lupulin Exchange'", [])
      ekg = insert!("ingredients", %{"name" => "ekg", "category_id" => hops})

      p =
        insert!("ingredient_products", %{
          "ingredient_id" => ekg,
          "manufacturer_party_id" => le,
          "form" => "T90 Pellet",
          "unit" => "lb",
          "origin" => "UK"
        })

      insert!("ingredient_lots", %{
        "ingredient_id" => ekg,
        "product_id" => p,
        "lot_number" => "MINE"
      })

      allspice = insert!("ingredients", %{"name" => "Allspice", "category_id" => spices})

      insert!("ingredient_products", %{
        "ingredient_id" => allspice,
        "form" => "Ground",
        "unit" => "fl oz"
      })

      assert seed!() ==
               "D63 reference: 1 new companies, 5 new ingredients, 10 new products, 5 new offers, 0 new lots"

      assert rows("SELECT lot_number FROM ingredient_lots WHERE ingredient_id = ?", [ekg]) == [
               ["MINE"]
             ]

      assert rows("SELECT unit FROM ingredient_products WHERE ingredient_id = ?", [allspice]) == [
               ["fl oz"]
             ]

      assert rows("SELECT origin FROM ingredient_products WHERE id = ?", [p]) == [["UK"]]
      assert hop("EKG") == []
    end
  end

  describe "values (§5.3)" do
    test "each value changed by hand first is left, named in the log, and still left after the seeds twice" do
      d64!()
      for {i, m, f, _, _, _} <- @values, do: set_value!(i, m, f, 42.5, if(f == "brix", do: 43))
      versions = rows("SELECT id, lock_version FROM ingredient_products ORDER BY id")
      log = up!()

      for {i, m, f, _, _, _} <- @values do
        {v, _} = value(i, m, f)
        assert v == 42.5
        assert log =~ "D63: left #{i} (#{m || "None"}) #{f} at 42.5"
      end

      # Untouched products keep their version (Pink Boots '24 and calcium chloride aside).
      after_ids =
        Map.new(rows("SELECT id, lock_version FROM ingredient_products"), &List.to_tuple/1)

      cacl = product_id("Calcium Chloride (Anhydrous)", nil)
      for [id, v] <- versions, id != cacl, do: assert(after_ids[id] == v)

      seed!()
      seed!()
      for {i, m, f, _, _, _} <- @values, do: assert({42.5, _} = value(i, m, f))
    end

    test "one value changed (DME at 97): it's left, every other is corrected" do
      d64!()
      set_value!("DME", "Muntons", "extract_fgdb", 97)
      log = up!()
      assert log =~ "D63: left DME (Muntons) extract_fgdb at 97 (expected 100)"
      assert length(Regex.scan(~r/D63:/, log)) == 1
      assert {97, nil} = value("DME", "Muntons", "extract_fgdb")

      for {i, m, f, _, new, _} <- @values, i != "DME" do
        {v, _} = value(i, m, f)
        assert_in_delta v, new, 1.0e-9
      end
    end

    test "a value removed by hand isn't put back; one already new is fine; a lot's copy stays" do
      d64!()
      type = one("SELECT id FROM feature_types WHERE key = 'extract_fgdb'", [])
      dme = product_id("DME", "Muntons")
      Repo.query!("DELETE FROM product_feature_values WHERE product_id = ?", [dme])
      set_value!("Dextrose (Corn Sugar)", nil, "extract_fgdb", 91.3)
      pils = product_id("Pilsner", "Root Shoot")
      grain = one("SELECT ingredient_id FROM ingredient_products WHERE id = ?", [pils])
      lot = insert!("ingredient_lots", %{"ingredient_id" => grain, "product_id" => pils})

      insert!("lot_feature_values", %{"lot_id" => lot, "feature_type_id" => type, "value" => 80.8})

      log = up!()
      assert log =~ "D63: left DME (Muntons) extract_fgdb at none (expected 100)"
      refute log =~ "Dextrose"
      assert value("DME", "Muntons", "extract_fgdb") == nil
      assert rows("SELECT value FROM lot_feature_values WHERE lot_id = ?", [lot]) == [[80.8]]
      assert {81.5, nil} = value("Pilsner", "Root Shoot", "extract_fgdb")
    end

    test "only that product: Weyermann and Rahr Pilsner, and Aseptic Fruit's lime, keep theirs" do
      d64!()

      keep = fn ->
        Enum.map(
          [
            {"Pilsner", "Rahr", "extract_fgdb"},
            {"Pilsner", "Weyermann", "moisture_pct"},
            {"Lime", "Aseptic Fruit", "brix"},
            {"Lemon", nil, "brix"}
          ],
          fn {i, m, f} -> value(i, m, f) end
        )
      end

      was = keep.()
      up!()
      assert keep.() == was
      assert was == [{81.5, nil}, {3.9, nil}, {6, 9.4}, {11, 11}]
    end

    test "a product renamed or gone is named in the log, and the rest go on" do
      d64!()
      Repo.query!("UPDATE ingredients SET name = 'Dry Malt Extract' WHERE name = 'DME'")
      log = up!()
      assert log =~ "D63: DME (Muntons) not found; its values weren't corrected"
      assert {8, 8} = value("Lime", nil, "brix")
    end
  end

  describe "Process Aids (§5.1)" do
    test "Finings in any case is renamed, keeping its id and ingredients" do
      d64!()
      Repo.query!("UPDATE ingredient_categories SET name = 'FININGS' WHERE name = 'Finings'")
      id = one("SELECT id FROM ingredient_categories WHERE name = 'FININGS'", [])
      up!()

      assert rows("SELECT name FROM ingredient_categories WHERE id = ?", [id]) == [
               ["Process Aids"]
             ]

      assert rows("SELECT category_id FROM ingredients WHERE name = 'Whirlfloc'") == [[id]]
    end

    test "a Process Aids already there (any case) stops it with a message, and nothing is renamed" do
      d64!()
      parent = one("SELECT id FROM ingredient_categories WHERE key = 'consumables'", [])
      insert!("ingredient_categories", %{"name" => "process aids", "parent_id" => parent})

      assert_raise RuntimeError, ~r/D63: there's already a category named process aids/, fn ->
        up!()
      end

      assert rows("SELECT name FROM ingredient_categories WHERE name = 'Finings'") == [
               ["Finings"]
             ]
    end

    test "a Finings somewhere else isn't renamed" do
      d64!()

      Repo.query!(
        "UPDATE ingredient_categories SET parent_id = (SELECT id FROM ingredient_categories WHERE key = 'grains') WHERE name = 'Finings'"
      )

      up!()

      assert rows("SELECT name FROM ingredient_categories WHERE name = 'Finings'") == [
               ["Finings"]
             ]
    end

    test "a lower-case Process Aids isn't doubled by the seeds" do
      d64!()
      up!()

      Repo.query!(
        "UPDATE ingredient_categories SET name = 'process aids' WHERE name = 'Process Aids'"
      )

      n = counts()["ingredient_categories"]
      seed!()
      assert counts()["ingredient_categories"] == n
    end
  end

  describe "calcium chloride (§5.4)" do
    test "the product moves with its offer and price; Hydrous stays with its ions" do
      d64!()
      id = product_id("Calcium Chloride (Hydrous)", nil)
      up!()
      assert product_id("Calcium Chloride (Anhydrous)", nil) == id

      assert rows(
               "SELECT o.pack_name, o.pack_size, p.price_per_pack FROM supplier_offers o " <>
                 "JOIN supplier_offer_prices p ON p.offer_id = o.id WHERE o.product_id = ?",
               [id]
             ) == [["bag", 50, 77]]

      ions = fn name ->
        rows(
          "SELECT v.value FROM ingredient_feature_values v JOIN ingredients i ON i.id = v.ingredient_id " <>
            "WHERE i.name = ? ORDER BY v.value",
          [name]
        )
      end

      assert ions.("Calcium Chloride (Anhydrous)") == [[95.4], [168.8]]
      assert ions.("Calcium Chloride (Hydrous)") == [[72], [127.4]]
    end

    test "with a lot it's left and logged; the seeds don't add a second product" do
      d64!()
      id = product_id("Calcium Chloride (Hydrous)", nil)
      hydrous = one("SELECT ingredient_id FROM ingredient_products WHERE id = ?", [id])
      insert!("ingredient_lots", %{"ingredient_id" => hydrous, "product_id" => id})
      assert up!() =~ "D63: calcium chloride's product not moved: the product has 1 lot(s)"
      seed!()
      seed!()
      assert product_id("Calcium Chloride (Hydrous)", nil) == id

      assert rows(
               "SELECT p.id FROM ingredient_products p JOIN ingredients i ON i.id = p.ingredient_id WHERE i.name = 'Calcium Chloride (Anhydrous)'"
             ) == []
    end

    test "Anhydrous with a product already: left and logged" do
      d64!()

      anhydrous =
        one("SELECT id FROM ingredients WHERE name = 'Calcium Chloride (Anhydrous)'", [])

      mine =
        insert!("ingredient_products", %{
          "ingredient_id" => anhydrous,
          "form" => "Powder",
          "unit" => "lb"
        })

      assert up!() =~ "not moved: Anhydrous already has a product"
      seed!()
      assert product_id("Calcium Chloride (Hydrous)", nil)

      assert rows("SELECT id FROM ingredient_products WHERE ingredient_id = ?", [anhydrous]) == [
               [mine]
             ]
    end

    test "a product that isn't the seeded one, or a second one, is left and logged" do
      d64!()
      id = product_id("Calcium Chloride (Hydrous)", nil)
      Repo.query!("UPDATE ingredient_products SET form = 'Powder' WHERE id = ?", [id])
      assert up!() =~ "not moved: Hydrous's product isn't the one seeded"
      assert product_id("Calcium Chloride (Hydrous)", nil) == id
    end
  end

  describe "Pink Boots (§5.5)" do
    test "split: the 2024 lot goes with its movements, alpha and cost; prices are copied" do
      d64!()
      id = product_id("Pink Boots Blend", "Yakima Chief Hops")
      offer = one("SELECT id FROM supplier_offers WHERE product_id = ?", [id])
      lot = one("SELECT id FROM ingredient_lots WHERE lot_number = 'P92-JUPBB4199'", [])

      for {price, on} <- [{150, "2026-11-01"}, {160.5, "2026-11-20"}],
          do:
            insert!("supplier_offer_prices", %{
              "offer_id" => offer,
              "price_per_pack" => price,
              "effective_on" => on
            })

      insert!("inventory_movements", %{
        "lot_id" => lot,
        "kind" => "used",
        "quantity" => -1.4,
        "occurred_on" => "2026-11-21"
      })

      Repo.query!(
        "UPDATE inventory_movements SET unit_cost = 14.5 WHERE lot_id = ? AND kind = 'opening'",
        [lot]
      )

      movements =
        rows(
          "SELECT id, kind, quantity, unit_cost FROM inventory_movements WHERE lot_id = ? ORDER BY id",
          [lot]
        )

      features = rows("SELECT id, value FROM lot_feature_values WHERE lot_id = ?", [lot])

      refute up!() =~ "D63:"

      assert product_id("Pink Boots '23", "Yakima Chief Hops") == id
      p24 = product_id("Pink Boots '24", "Yakima Chief Hops")
      [[y24]] = hop("Pink Boots '24")

      assert rows(
               "SELECT ingredient_id, product_id, crop_year FROM ingredient_lots WHERE id = ?",
               [lot]
             ) == [[y24, p24, 2024]]

      assert rows("SELECT product_id FROM ingredient_lots WHERE lot_number = 'P92-IUPBB3182'") ==
               [[id]]

      assert rows(
               "SELECT id, kind, quantity, unit_cost FROM inventory_movements WHERE lot_id = ? ORDER BY id",
               [lot]
             ) == movements

      assert rows("SELECT id, value FROM lot_feature_values WHERE lot_id = ?", [lot]) == features

      assert rows("SELECT form, unit, origin FROM ingredient_products WHERE id = ?", [p24]) == [
               ["T90 Pellet", "lb", "USA"]
             ]

      prices = fn product ->
        rows(
          "SELECT o.order_name, o.pack_name, o.pack_size, p.price_per_pack, p.effective_on FROM supplier_offers o " <>
            "JOIN supplier_offer_prices p ON p.offer_id = o.id WHERE o.product_id = ? ORDER BY 5",
          [product]
        )
      end

      assert length(prices.(id)) == 2
      assert prices.(p24) == prices.(id)

      stock = Inventory.on_hand_by_product([id, p24])
      assert Decimal.eq?(stock[id], Decimal.new("8.5"))
      assert Decimal.eq?(stock[p24], Decimal.new("1.5"))
      seed!()
      assert [["Pink Boots '23", _, 8.5], ["Pink Boots '24", _, left]] = pink()
      assert_in_delta left, 1.5, 1.0e-9
    end

    for {what, sql} <- [
          {"a third lot",
           "INSERT INTO ingredient_lots (ingredient_id, product_id, lot_number, inserted_at, updated_at) SELECT ingredient_id, id, 'THIRD', '2026-11-23', '2026-11-23' FROM ingredient_products WHERE ingredient_id = (SELECT id FROM ingredients WHERE name = 'Pink Boots Blend')"},
          {"a lot # changed",
           "UPDATE ingredient_lots SET lot_number = 'P92-JUPBB0000' WHERE lot_number = 'P92-JUPBB4199'"},
          {"a crop year changed",
           "UPDATE ingredient_lots SET crop_year = 2023 WHERE lot_number = 'P92-JUPBB4199'"},
          {"a second product",
           "INSERT INTO ingredient_products (ingredient_id, unit, form, name, inserted_at, updated_at) SELECT id, 'lb', 'Cryo', 'X', '2026-11-23', '2026-11-23' FROM ingredients WHERE name = 'Pink Boots Blend'"},
          {"a second offer",
           "INSERT INTO supplier_offers (product_id, supplier_party_id, pack_name, pack_size, inserted_at, updated_at) SELECT p.id, (SELECT id FROM parties WHERE name = 'BSG'), 'box', 11, '2026-11-23', '2026-11-23' FROM ingredient_products p JOIN ingredients i ON i.id = p.ingredient_id WHERE i.name = 'Pink Boots Blend'"},
          {"Pink Boots '24 there already",
           "INSERT INTO ingredients (name, category_id, inserted_at, updated_at) SELECT 'Pink Boots ''24', id, '2026-11-23', '2026-11-23' FROM ingredient_categories WHERE key = 'hops'"}
        ] do
      test "not as seeded (#{what}): nothing changes, the log says so, and the seeds add no Pink Boots lot" do
        d64!()
        Repo.query!(unquote(sql))
        before = rows("SELECT * FROM ingredient_lots ORDER BY id")

        products =
          rows(
            "SELECT * FROM ingredient_products WHERE ingredient_id IN (SELECT id FROM ingredients WHERE name LIKE 'Pink Boots%') ORDER BY id"
          )

        assert up!() =~ "D63: Pink Boots not split"
        assert [_] = hop("Pink Boots Blend")
        assert rows("SELECT * FROM ingredient_lots ORDER BY id") == before

        n = length(pink())
        seed!()
        seed!()
        assert length(pink()) == n
        assert [_] = hop("Pink Boots Blend")
        assert hop("Pink Boots '23") == []

        assert rows(
                 "SELECT * FROM ingredient_products WHERE ingredient_id IN (SELECT id FROM ingredients WHERE name LIKE 'Pink Boots%') ORDER BY id"
               ) == products
      end
    end

    test "renamed by hand before: nothing changes, and the seeds add no second lot" do
      d64!()
      Repo.query!("UPDATE ingredients SET name = 'Pink Boots' WHERE name = 'Pink Boots Blend'")
      assert up!() =~ "D63: Pink Boots not split: there's no Pink Boots Blend"
      seed!()
      seed!()
      assert [["Pink Boots", _, 8.5], ["Pink Boots", _, 2.9]] = pink()
    end

    for kind <- [:order, :contract] do
      test "#{kind} line on it: renamed only; the line and both lots stay with '23, and the seeds add no '24" do
        d64!()
        id = product_id("Pink Boots Blend", "Yakima Chief Hops")
        offer = one("SELECT id FROM supplier_offers WHERE product_id = ?", [id])
        yakima = one("SELECT id FROM parties WHERE name = 'Yakima Chief Hops'", [])

        if unquote(kind) == :order do
          order =
            insert!("purchase_orders", %{
              "supplier_party_id" => yakima,
              "ordered_on" => "2026-11-22"
            })

          insert!("purchase_order_lines", %{
            "order_id" => order,
            "offer_id" => offer,
            "packs_ordered" => 1,
            "price_per_pack" => 150
          })
        else
          contract =
            insert!("supplier_contracts", %{"supplier_party_id" => yakima, "year" => 2027})

          insert!("supplier_contract_lines", %{
            "contract_id" => contract,
            "product_id" => id,
            "quantity" => 22,
            "price" => 15
          })
        end

        assert up!() =~
                 "D63: Pink Boots Blend renamed Pink Boots '23, but not split: 1 order or contract line(s)"

        assert product_id("Pink Boots '23", "Yakima Chief Hops") == id
        assert hop("Pink Boots '24") == []
        seed!()
        seed!()
        assert [["Pink Boots '23", _, 8.5], ["Pink Boots '23", _, 2.9]] = pink()
        assert hop("Pink Boots '24") == []
      end
    end
  end
end
