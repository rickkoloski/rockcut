defmodule RockcutApi.Repo.Migrations.CopyLotSpecsToFeatures do
  @moduledoc """
  D60 §3.4: the seven feature types, every lot's spec columns copied into
  `lot_feature_values`, and the Grains / Origin and Grains / Maltster custom
  fields deleted (§3.1, decision 2). Plain SQL, not the app schemas, so it
  still runs after they change. The columns go in the next migration.

  `down` copies the values back into the columns, puts the two definitions
  back on Grains, and deletes the feature types with every value and
  applicability row (the tables themselves go with the previous migration).
  """
  use Ecto.Migration

  @now "strftime('%Y-%m-%dT%H:%M:%S', 'now')"

  # {key, label, unit label, min, max, decimals}
  @feature_types [
    {"extract_fgdb", "Extract", "% FGDB", 0, 100, 1},
    {"color_lovibond", "Color", "°L", 0, 1000, 2},
    {"diastatic_power_lintner", "Diastatic power", "°Lintner", 0, 1000, 1},
    {"protein_pct", "Protein", "%", 0, 100, 2},
    {"moisture_pct", "Moisture", "%", 0, 100, 2},
    {"alpha_acid_pct", "Alpha acid", "%", 0, 100, 1},
    {"attenuation_pct", "Attenuation", "%", 0, 100, 0}
  ]

  # old `ingredient_lots` column => feature type key
  @columns [
    {"color_lovibond", "color_lovibond"},
    {"extract_potential_fgdb", "extract_fgdb"},
    {"protein_perc", "protein_pct"},
    {"moisture_perc", "moisture_pct"},
    {"diastatic_power_linter", "diastatic_power_lintner"},
    {"alpha_acid", "alpha_acid_pct"},
    {"attenuation", "attenuation_pct"}
  ]

  def up do
    for {key, label, unit, min, max, decimals} <- @feature_types do
      execute(fn ->
        repo().query!(
          """
          INSERT INTO feature_types (key, label, unit_label, min, max, decimals, inserted_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, #{@now}, #{@now})
          ON CONFLICT (key) DO NOTHING
          """,
          [key, label, unit, min, max, decimals]
        )
      end)
    end

    for sql <- copy(), do: execute(sql)

    execute("""
    DELETE FROM category_field_definitions
    WHERE field_name IN ('Origin', 'Maltster')
      AND category_id IN (SELECT id FROM ingredient_categories WHERE name = 'Grains')
    """)
  end

  def down do
    for {column, key} <- @columns do
      execute("""
      UPDATE ingredient_lots SET #{column} = (
        SELECT v.value FROM lot_feature_values v JOIN feature_types f ON f.id = v.feature_type_id
        WHERE v.lot_id = ingredient_lots.id AND f.key = '#{key}')
      """)
    end

    for {name, sort_order} <- [{"Origin", 0}, {"Maltster", 1}] do
      execute("""
      INSERT INTO category_field_definitions
        (category_id, field_name, field_type, required, sort_order, inserted_at, updated_at)
      SELECT id, '#{name}', 'text', 0, #{sort_order}, #{@now}, #{@now}
      FROM ingredient_categories WHERE name = 'Grains'
      ON CONFLICT (category_id, field_name) DO NOTHING
      """)
    end

    execute("DELETE FROM lot_feature_values")
    execute("DELETE FROM product_feature_values")
    execute("DELETE FROM category_feature_types")
    execute("DELETE FROM feature_types")
  end

  @doc """
  The copy's statements: one per old column, a feature value for every lot
  where the column isn't null (`CopyLotSpecsToFeaturesTest` checks them).
  """
  def copy do
    for {column, key} <- @columns do
      """
      INSERT INTO lot_feature_values (lot_id, feature_type_id, value, inserted_at, updated_at)
      SELECT l.id, f.id, l.#{column}, #{@now}, #{@now}
      FROM ingredient_lots l JOIN feature_types f ON f.key = '#{key}'
      WHERE l.#{column} IS NOT NULL
      ON CONFLICT (lot_id, feature_type_id) DO NOTHING
      """
    end
  end
end
