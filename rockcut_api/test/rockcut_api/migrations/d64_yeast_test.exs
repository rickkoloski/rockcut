defmodule RockcutApi.Migrations.D64YeastTest do
  @moduledoc """
  D64 Stop 1 migrations run for real (plan migrations 1–4):
  `create_yeast_strain_types`, `d64_yeast_features`, `d64_yeast_tidy_up`
  and `add_batch_to_inventory_movements`, on a database file of its own
  (as `D65ProductsAndCategoriesTest`), starting shaped like D65 prod: Yeast
  Strains with the five old fields (and one more someone added), US-05,
  WLP001 (with a product), Wyeast 1056 (nothing), WLP002 (a product and a
  lot), and D60's attenuation row on it.
  """
  use ExUnit.Case, async: false

  import ExUnit.CaptureLog

  alias RockcutApi.Repo

  @before 20_261_121_140_001
  @last 20_261_122_120_004
  @now "2026-11-21T12:00:00Z"

  setup do
    path = Path.join(System.tmp_dir!(), "rockcut_d64_#{System.unique_integer([:positive])}.db")

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
    %{ids: d65_prod!()}
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

  defp d65_prod! do
    yeast = insert!("ingredient_categories", %{"name" => "Yeast Strains", "key" => "yeast"})

    for {name, type, sort} <- [
          {"Lab", "text", 0},
          {"Product Code", "text", 1},
          {"Temp Range Low (F)", "number", 2},
          {"Temp Range High (F)", "number", 3},
          {"Form", "dropdown", 4},
          {"Supplier notes", "text", 5}
        ] do
      insert!("category_field_definitions", %{
        "category_id" => yeast,
        "field_name" => name,
        "field_type" => type,
        "sort_order" => sort
      })
    end

    [[attenuation]] = rows("SELECT id FROM feature_types WHERE key = 'attenuation_pct'")

    insert!("category_feature_types", %{
      "category_id" => yeast,
      "feature_type_id" => attenuation,
      "product_mode" => "value",
      "lot_mode" => "copy"
    })

    white_labs = insert!("parties", %{"name" => "White Labs"})
    strain = &insert!("ingredients", %{"name" => &1, "category_id" => yeast})
    us05 = strain.("US-05")
    wlp001 = strain.("WLP001")
    wyeast = strain.("Wyeast 1056")
    wlp002 = strain.("WLP002")

    insert!("ingredient_products", %{
      "ingredient_id" => wlp001,
      "manufacturer_party_id" => white_labs,
      "unit" => "each",
      "form" => "Liquid"
    })

    wlp002_product =
      insert!("ingredient_products", %{
        "ingredient_id" => wlp002,
        "manufacturer_party_id" => white_labs,
        "unit" => "each",
        "form" => "Liquid"
      })

    insert!("ingredient_lots", %{
      "ingredient_id" => wlp002,
      "product_id" => wlp002_product,
      "lot_number" => "W2",
      "pack_name" => "pitchable",
      "status" => "available"
    })

    %{yeast: yeast, us05: us05, wlp001: wlp001, wyeast: wyeast, wlp002: wlp002}
  end

  test "up: strain types, yeast features, the old fields and an unused strain gone, kept ones logged, batch on movements",
       %{ids: ids} do
    log = capture_log(fn -> migrate(:up, to: @last) end)

    assert rows("SELECT name, position, retired_at FROM yeast_strain_types ORDER BY position") ==
             [["Ale", 0, nil], ["Lager", 1, nil], ["Brett", 2, nil], ["Lacto", 3, nil]]

    assert rows(
             """
             SELECT f.key, a.product_mode, a.lot_mode, a.lot_required, a.only_form, a.sort_order
             FROM category_feature_types a JOIN feature_types f ON f.id = a.feature_type_id
             WHERE a.category_id = ? ORDER BY a.sort_order
             """,
             [ids.yeast]
           ) == [
             ["ferm_temp_f", "range", "none", 0, nil, 0],
             ["attenuation_pct", "range", "none", 0, nil, 1],
             ["pitch_bbl", "value", "copy", 1, "Liquid", 2]
           ]

    assert rows(
             "SELECT label, unit_label, min, max, decimals FROM feature_types " <>
               "WHERE key IN ('ferm_temp_f', 'attenuation_pct', 'pitch_bbl') ORDER BY key"
           ) == [
             ["Attenuation", "%", 0, 100, 0],
             ["Fermentation temp", "°F", 32, 100, 0],
             ["Pitch size", "bbl", 0.5, 60, 1]
           ]

    # The five old fields go; one someone added stays, and the log says so.
    assert rows("SELECT field_name FROM category_field_definitions WHERE category_id = ?", [
             ids.yeast
           ]) == [["Supplier notes"]]

    assert log =~ "D64: kept Yeast Strains field Supplier notes"

    # Wyeast 1056 had nothing: gone. WLP001 (a product) and WLP002 (a lot) stay, logged.
    names = rows("SELECT name FROM ingredients ORDER BY name") |> List.flatten()
    assert names == ["US-05", "WLP001", "WLP002"]
    assert log =~ "D64: kept ingredient WLP001: 1 products, 0 lots, 0 recipe lines"
    assert log =~ "D64: kept ingredient WLP002: 1 products, 1 lots, 0 recipe lines"
    refute log =~ "Wyeast"

    # The new columns, empty.
    assert rows("SELECT yeast_strain_type_id FROM ingredients WHERE id = ?", [ids.us05]) == [
             [nil]
           ]

    assert rows(
             "SELECT count(*) FROM pragma_table_info('inventory_movements') WHERE name = 'batch_id'"
           ) == [[1]]

    # A strain type in use can't be deleted (restrict).
    [[ale]] = rows("SELECT id FROM yeast_strain_types WHERE name = 'Ale'")
    Repo.query!("UPDATE ingredients SET yeast_strain_type_id = ? WHERE id = ?", [ale, ids.us05])

    assert_raise Exqlite.Error, fn ->
      Repo.query!("DELETE FROM yeast_strain_types WHERE id = ?", [ale])
    end
  end

  test "down puts the fields back and takes the column away; up again gives the same rows", %{
    ids: ids
  } do
    yeast_rows = fn ->
      rows(
        """
        SELECT f.key, a.product_mode, a.lot_mode, a.lot_required, a.only_form, a.sort_order
        FROM category_feature_types a JOIN feature_types f ON f.id = a.feature_type_id
        WHERE a.category_id = ? ORDER BY a.sort_order
        """,
        [ids.yeast]
      )
    end

    capture_log(fn -> migrate(:up, to: @last) end)
    before = yeast_rows.()

    capture_log(fn -> migrate(:down, to: 20_261_122_120_001) end)

    assert rows("SELECT count(*) FROM category_field_definitions WHERE category_id = ?", [
             ids.yeast
           ]) == [[6]]

    assert rows(
             "SELECT count(*) FROM pragma_table_info('ingredients') WHERE name = 'yeast_strain_type_id'"
           ) == [[0]]

    capture_log(fn -> migrate(:up, to: @last) end)
    assert yeast_rows.() == before

    assert rows("SELECT name FROM yeast_strain_types ORDER BY position") ==
             [["Ale"], ["Lager"], ["Brett"], ["Lacto"]]
  end

  test "stops, naming them, when a yeast lot has no product; nothing of the tidy-up is done", %{
    ids: ids
  } do
    insert!("ingredient_lots", %{
      "ingredient_id" => ids.us05,
      "lot_number" => "Y-7",
      "status" => "available"
    })

    error =
      assert_raise RuntimeError, fn ->
        capture_log(fn -> migrate(:up, to: @last) end)
      end

    assert error.message ==
             "D64: these yeast lots have no product; give each a product (or remove them) first: US-05 lot Y-7"

    assert rows("SELECT count(*) FROM category_field_definitions WHERE category_id = ?", [
             ids.yeast
           ]) == [[6]]

    assert rows("SELECT count(*) FROM ingredients WHERE name = 'Wyeast 1056'") == [[1]]
  end
end
