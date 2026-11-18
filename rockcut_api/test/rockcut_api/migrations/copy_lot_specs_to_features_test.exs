defmodule RockcutApi.Migrations.CopyLotSpecsToFeaturesTest do
  @moduledoc """
  D60 §3.4 (`copy_lot_specs_to_features`, `drop_lot_spec_columns`): the two
  migrations run for real. Down to before the copy, a lot gets every old spec
  column set and the Grains Origin/Maltster definitions; up again, the lot
  has matching `lot_feature_values`, the columns and definitions are gone.
  Down once more puts the values back in the columns. Run inside the test's
  transaction (SQLite's DDL is transactional, so the rollback at the end
  puts the schema back).
  """
  use RockcutApi.DataCase, async: false

  alias RockcutApi.Brewing

  @copy_version 20_261_117_120_002
  @copy RockcutApi.Repo.Migrations.CopyLotSpecsToFeatures
  @drop_version 20_261_117_120_003
  @drop RockcutApi.Repo.Migrations.DropLotSpecColumns

  # old column => {feature key, value}
  @specs %{
    "color_lovibond" => {"color_lovibond", "2.71"},
    "extract_potential_fgdb" => {"extract_fgdb", "80.3"},
    "protein_perc" => {"protein_pct", "11.5"},
    "moisture_perc" => {"moisture_pct", "3.3"},
    "diastatic_power_linter" => {"diastatic_power_lintner", "124"},
    "alpha_acid" => {"alpha_acid_pct", "5.5"},
    "attenuation" => {"attenuation_pct", "78"}
  }

  setup_all do
    Code.require_file("priv/repo/migrations/20261117120002_copy_lot_specs_to_features.exs")
    Code.require_file("priv/repo/migrations/20261117120003_drop_lot_spec_columns.exs")
    :ok
  end

  defp down(version, migration),
    do: assert(:ok = Ecto.Migrator.down(Repo, version, migration, log: false))

  defp up(version, migration),
    do: assert(:ok = Ecto.Migrator.up(Repo, version, migration, log: false))

  defp column?(column) do
    %{rows: [[n]]} =
      Repo.query!(
        "SELECT count(*) FROM pragma_table_info('ingredient_lots') WHERE name = ?",
        [column]
      )

    n == 1
  end

  defp lot_features(lot_id) do
    Repo.query!(
      """
      SELECT f.key, v.value FROM lot_feature_values v
      JOIN feature_types f ON f.id = v.feature_type_id WHERE v.lot_id = ?
      """,
      [lot_id]
    ).rows
    |> Map.new(fn [key, value] -> {key, Decimal.new(to_string(value))} end)
  end

  defp grain_definitions(category_id) do
    Repo.query!(
      "SELECT field_name FROM category_field_definitions WHERE category_id = ? ORDER BY sort_order",
      [category_id]
    ).rows
    |> List.flatten()
  end

  test "every old spec column ends up as a feature value; the columns and Origin/Maltster go" do
    {:ok, grains} = Brewing.create_ingredient_category(%{name: "Grains"})
    down(@drop_version, @drop)
    down(@copy_version, @copy)

    {:ok, grain} = Brewing.create_ingredient(%{name: "2-Row", category_id: grains.id})
    {:ok, full} = Brewing.create_ingredient_lot(%{ingredient_id: grain.id, lot_number: "FULL"})
    {:ok, empty} = Brewing.create_ingredient_lot(%{ingredient_id: grain.id, lot_number: "NONE"})

    sets = Enum.map_join(@specs, ", ", fn {column, {_, value}} -> "#{column} = #{value}" end)

    Repo.query!("UPDATE ingredient_lots SET #{sets}, maltster = 'Root Shoot' WHERE id = ?", [
      full.id
    ])

    # A blank stays blank: only moisture on this one.
    Repo.query!("UPDATE ingredient_lots SET moisture_perc = 4.1 WHERE id = ?", [empty.id])

    # down put the two definitions back on Grains.
    assert grain_definitions(grains.id) == ["Origin", "Maltster"]

    up(@copy_version, @copy)
    up(@drop_version, @drop)

    assert lot_features(full.id) ==
             Map.new(@specs, fn {_, {key, value}} -> {key, Decimal.new(value)} end)

    assert lot_features(empty.id) == %{"moisture_pct" => Decimal.new("4.1")}
    assert grain_definitions(grains.id) == []

    for column <- Map.keys(@specs) ++ ~w(maltster supplier order_name order_unit_size properties),
        do: refute(column?(column), column)

    # And back: the columns return holding the values.
    down(@drop_version, @drop)
    down(@copy_version, @copy)

    %{rows: [row]} =
      Repo.query!(
        "SELECT #{Enum.join(Map.keys(@specs), ", ")} FROM ingredient_lots WHERE id = ?",
        [full.id]
      )

    assert Enum.map(row, &Decimal.new(to_string(&1))) ==
             Enum.map(Map.values(@specs), fn {_, v} -> Decimal.new(v) end)

    up(@copy_version, @copy)
    up(@drop_version, @drop)
  end

  test "the seven feature types and their ranges" do
    rows =
      Repo.query!("SELECT key, unit_label, min, max FROM feature_types ORDER BY id").rows

    assert rows == [
             ["extract_fgdb", "% FGDB", 0, 100],
             ["color_lovibond", "°L", 0, 1000],
             ["diastatic_power_lintner", "°Lintner", 0, 1000],
             ["protein_pct", "%", 0, 100],
             ["moisture_pct", "%", 0, 100],
             ["alpha_acid_pct", "%", 0, 100],
             ["attenuation_pct", "%", 0, 100]
           ]
  end
end
