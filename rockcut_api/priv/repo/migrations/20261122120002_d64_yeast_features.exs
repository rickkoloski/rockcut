defmodule RockcutApi.Repo.Migrations.D64YeastFeatures do
  @moduledoc """
  D64 plan migration 2 (spec §4.3, Amendment 6). Every step is idempotent:

    * feature types `ferm_temp_f` (Fermentation temp, °F, 32–100, 0
      decimals) and `pitch_bbl` (Pitch size, bbl, 0.5–60, 1 decimal);
      `attenuation_pct` (Attenuation, %, 0–100, 0 decimals) is D60's and
      is set to those values;
    * the Yeast Strains rows: fermentation temp and attenuation a typical
      range on the product, none on the lot; pitch size on Liquid products
      only (`only_form`), optional on the product, copied to a new lot when
      the product has one, and required on the lot (`lot_required`).

  D60's Yeast Strains row for attenuation (a standard copied to lots) is
  replaced. `down` takes the yeast rows away (with any values stored for the
  two new types) and the two new types.
  """
  use Ecto.Migration

  @now "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"

  # {key, label, unit label, min, max, decimals}
  @types [
    {"ferm_temp_f", "Fermentation temp", "°F", 32, 100, 0},
    {"attenuation_pct", "Attenuation", "%", 0, 100, 0},
    {"pitch_bbl", "Pitch size", "bbl", "0.5", 60, 1}
  ]

  # {feature key, sort order, product mode, lot mode, lot required, only form}
  @rows [
    {"ferm_temp_f", 0, "range", "none", false, nil},
    {"attenuation_pct", 1, "range", "none", false, nil},
    {"pitch_bbl", 2, "value", "copy", true, "Liquid"}
  ]

  def up do
    for {key, label, unit, min, max, decimals} <- @types do
      execute(fn ->
        repo().query!(
          """
          INSERT INTO feature_types (key, label, unit_label, min, max, decimals, inserted_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, #{@now}, #{@now})
          ON CONFLICT (key) DO UPDATE SET
            label = excluded.label, unit_label = excluded.unit_label, min = excluded.min,
            max = excluded.max, decimals = excluded.decimals
          """,
          [key, label, unit, min, max, decimals]
        )
      end)
    end

    for {feature, sort_order, product_mode, lot_mode, lot_required, only_form} <- @rows do
      execute(fn ->
        repo().query!(
          """
          INSERT INTO category_feature_types
            (category_id, feature_type_id, sort_order, required, product_mode, lot_mode,
             lot_required, only_form, inserted_at, updated_at)
          SELECT c.id, f.id, ?, false, ?, ?, ?, ?, #{@now}, #{@now}
          FROM ingredient_categories c, feature_types f
          WHERE c.key = 'yeast' AND f.key = ?
          ON CONFLICT (category_id, feature_type_id) DO UPDATE SET
            product_mode = excluded.product_mode, lot_mode = excluded.lot_mode,
            lot_required = excluded.lot_required, only_form = excluded.only_form,
            sort_order = excluded.sort_order
          """,
          # SQLite booleans are 0/1 (a bound Elixir boolean would be stored as text).
          [
            sort_order,
            product_mode,
            lot_mode,
            if(lot_required, do: 1, else: 0),
            only_form,
            feature
          ]
        )
      end)
    end
  end

  def down do
    new_types = "SELECT id FROM feature_types WHERE key IN ('ferm_temp_f', 'pitch_bbl')"

    execute("""
    DELETE FROM category_feature_types
    WHERE category_id IN (SELECT id FROM ingredient_categories WHERE key = 'yeast')
      AND feature_type_id IN (SELECT id FROM feature_types WHERE key IN ('ferm_temp_f', 'attenuation_pct', 'pitch_bbl'))
    """)

    for table <- ~w(category_feature_types product_feature_values lot_feature_values) do
      execute("DELETE FROM #{table} WHERE feature_type_id IN (#{new_types})")
    end

    execute("DELETE FROM feature_types WHERE key IN ('ferm_temp_f', 'pitch_bbl')")
  end
end
