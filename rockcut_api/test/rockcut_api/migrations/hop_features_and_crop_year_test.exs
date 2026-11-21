defmodule RockcutApi.Migrations.HopFeaturesAndCropYearTest do
  @moduledoc """
  D62 Stage 2 (`hop_features_and_crop_year`) run for real: down to before
  it, a grain standard, the old Hops custom fields and a Hops lot with no
  product; up stops on that lot and names it; without it, up keeps the grain
  standard (no high end), gives grain's rows `value`/`copy`, makes Hops'
  alpha, beta and oil ranges entered on the lot (alpha required), widens
  alpha to 2 decimals, adds the crop year and deletes the Hops fields. Down
  drops a range with no low end and puts the fields back. Run inside the
  test's transaction.
  """
  use RockcutApi.DataCase, async: false

  @version 20_261_120_120_001
  @migration RockcutApi.Repo.Migrations.HopFeaturesAndCropYear

  setup_all do
    Code.require_file("priv/repo/migrations/20261120120001_hop_features_and_crop_year.exs")
    :ok
  end

  @now "2026-11-20T12:00:00Z"

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

  defp one(sql, params \\ []) do
    %{rows: [row]} = Repo.query!(sql, params)
    row
  end

  defp columns(table) do
    Repo.query!("SELECT name FROM pragma_table_info('#{table}')").rows |> List.flatten()
  end

  defp feature_id(key), do: hd(one("SELECT id FROM feature_types WHERE key = ?", [key]))

  test "a loose Hops lot stops it; otherwise grain keeps its standard and hops get ranges" do
    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    refute "crop_year" in columns("ingredient_lots")
    refute "value_high" in columns("product_feature_values")

    grains =
      insert!("ingredient_categories", %{"name" => "Grains", "key" => "grains", "sort_order" => 0})

    hops =
      insert!("ingredient_categories", %{"name" => "Hops", "key" => "hops", "sort_order" => 1})

    for key <- ~w(extract_fgdb alpha_acid_pct) do
      insert!("category_feature_types", %{
        "category_id" => if(key == "alpha_acid_pct", do: hops, else: grains),
        "feature_type_id" => feature_id(key),
        "sort_order" => 0,
        "required" => false
      })
    end

    insert!("category_field_definitions", %{
      "category_id" => hops,
      "field_name" => "Crop Year",
      "field_type" => "text",
      "required" => false,
      "sort_order" => 2
    })

    maker = insert!("parties", %{"name" => "Rahr", "active" => true})
    two_row = insert!("ingredients", %{"name" => "2-Row", "category_id" => grains})
    citra = insert!("ingredients", %{"name" => "Citra", "category_id" => hops})

    product =
      insert!("ingredient_products", %{
        "ingredient_id" => two_row,
        "manufacturer_party_id" => maker,
        "active" => true,
        "unit" => "lb"
      })

    insert!("product_feature_values", %{
      "product_id" => product,
      "feature_type_id" => feature_id("extract_fgdb"),
      "value" => "81.5",
      "entered_value" => "37.6",
      "entered_unit" => "ppg"
    })

    loose =
      insert!("ingredient_lots", %{
        "ingredient_id" => citra,
        "lot_number" => "OLD-7",
        "status" => "available",
        "pack_name" => "sack"
      })

    error =
      assert_raise RuntimeError, fn ->
        Ecto.Migrator.up(Repo, @version, @migration, log: false)
      end

    assert error.message =~ "1 Hops lot(s) have no product"
    assert error.message =~ "##{loose} Citra OLD-7"

    Repo.query!("DELETE FROM ingredient_lots WHERE id = ?", [loose])
    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)

    assert ["81.5", nil, "37.6", "ppg"] =
             one(
               "SELECT CAST(value AS TEXT), value_high, CAST(entered_value AS TEXT), entered_unit " <>
                 "FROM product_feature_values WHERE product_id = ?",
               [product]
             )

    assert ["value", "copy", 0] =
             one(
               "SELECT product_mode, lot_mode, lot_required FROM category_feature_types WHERE category_id = ?",
               [grains]
             )

    rows =
      Repo.query!(
        """
        SELECT f.key, a.product_mode, a.lot_mode, a.lot_required, f.decimals
        FROM category_feature_types a JOIN feature_types f ON f.id = a.feature_type_id
        WHERE a.category_id = ? ORDER BY a.sort_order
        """,
        [hops]
      ).rows

    assert rows == [
             ["alpha_acid_pct", "range", "enter", 1, 2],
             ["beta_acid_pct", "range", "enter", 0, 2],
             ["total_oil_ml_100g", "range", "enter", 0, 2]
           ]

    assert "crop_year" in columns("ingredient_lots")

    assert [0] =
             one("SELECT count(*) FROM category_field_definitions WHERE category_id = ?", [hops])

    # A range with only a high end has no value to keep: down drops it.
    Repo.query!(
      "INSERT INTO product_feature_values (product_id, feature_type_id, value, value_high, inserted_at, updated_at) " <>
        "VALUES (?, ?, NULL, 13, ?, ?)",
      [product, feature_id("alpha_acid_pct"), @now, @now]
    )

    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)

    assert [1] =
             one("SELECT count(*) FROM product_feature_values WHERE product_id = ?", [product])

    assert [1] = one("SELECT decimals FROM feature_types WHERE key = 'alpha_acid_pct'")
    assert [0] = one("SELECT count(*) FROM feature_types WHERE key = 'beta_acid_pct'")

    # Form, Origin and Crop Year come back.
    assert [3] =
             one("SELECT count(*) FROM category_field_definitions WHERE category_id = ?", [hops])

    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)
  end
end
