defmodule RockcutApi.Repo.Migrations.D65FeaturesAndPackNote do
  @moduledoc """
  D65 plan migrations 1, 2 and 4 (spec §4.4; the salts, sugars, fruit and
  finings amendments). Additive, and every step is idempotent:

    * feature types `brix` (°Bx, 0–100, 1 decimal) and the seven ions
      `ca_ppm_per_g_gal` … `cl_ppm_per_g_gal` (ppm @ 1 g/gal, 0–1000, 1
      decimal, on the ingredient; Water Salts only, `Ingredients.IngredientFeatures`);
      `extract_fgdb` takes 2 decimals (81.95, 80.33; stored grain values
      don't change);
    * `category_feature_types.only_form`: the feature applies only to that
      form's products (Brix on Liquid sugars), as `only_unit` does for a unit;
    * Fruits: Brix, a typical range on the product, entered (optional) on each
      lot. Sugars and Extracts: extract a standard on the product copied to
      each lot (editable, as grain), and Brix entered (optional) on Liquid
      lots only;
    * `supplier_offers.pack_note`: an optional note on the pack ("5 lb"),
      at most 40 characters (the changeset's rule).

  `down` takes them away again (with any values stored for them) and puts
  extract back to 1 decimal.
  """
  use Ecto.Migration

  @now "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"

  @ions ~w(ca mg co3 hco3 so4 na cl)
  @ion_labels %{
    "ca" => "Calcium",
    "mg" => "Magnesium",
    "co3" => "Carbonate",
    "hco3" => "Bicarbonate",
    "so4" => "Sulfate",
    "na" => "Sodium",
    "cl" => "Chloride"
  }

  # {key, label, unit label, min, max, decimals}
  defp new_types do
    [{"brix", "Brix", "°Bx", 0, 100, 1}] ++
      for ion <- @ions,
          do: {"#{ion}_ppm_per_g_gal", @ion_labels[ion], "ppm @ 1 g/gal", 0, 1000, 1}
  end

  # {category key, feature key, sort order, product mode, lot mode, only form}
  @applicability [
    {"fruits", "brix", 0, "range", "enter", nil},
    {"sugars", "extract_fgdb", 0, "value", "copy", nil},
    {"sugars", "brix", 1, "none", "enter", "Liquid"}
  ]

  def up do
    # SQLite has no ADD COLUMN IF NOT EXISTS: checked first, so a second run is a no-op.
    execute(fn -> add_column("category_feature_types", "only_form") end)
    execute(fn -> add_column("supplier_offers", "pack_note") end)

    for {key, label, unit, min, max, decimals} <- new_types() do
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

    execute("UPDATE feature_types SET decimals = 2 WHERE key = 'extract_fgdb'")

    for {category, feature, sort_order, product_mode, lot_mode, only_form} <- @applicability do
      execute(fn ->
        repo().query!(
          """
          INSERT INTO category_feature_types
            (category_id, feature_type_id, sort_order, required, product_mode, lot_mode,
             lot_required, only_form, inserted_at, updated_at)
          SELECT c.id, f.id, ?, false, ?, ?, false, ?, #{@now}, #{@now}
          FROM ingredient_categories c, feature_types f
          WHERE c.key = ? AND f.key = ?
          ON CONFLICT (category_id, feature_type_id) DO UPDATE SET
            product_mode = excluded.product_mode, lot_mode = excluded.lot_mode,
            lot_required = false, only_form = excluded.only_form, sort_order = excluded.sort_order
          """,
          [sort_order, product_mode, lot_mode, only_form, category, feature]
        )
      end)
    end
  end

  defp add_column(table, column) do
    %{rows: rows} =
      repo().query!("SELECT 1 FROM pragma_table_info('#{table}') WHERE name = ?", [column])

    if rows == [], do: repo().query!(~s|ALTER TABLE "#{table}" ADD COLUMN "#{column}" TEXT|)
  end

  def down do
    keys = Enum.map_join(new_types(), ", ", fn {key, _, _, _, _, _} -> "'#{key}'" end)
    types = "SELECT id FROM feature_types WHERE key IN (#{keys})"

    execute("""
    DELETE FROM category_feature_types
    WHERE feature_type_id IN (SELECT id FROM feature_types WHERE key = 'extract_fgdb')
      AND category_id IN (SELECT id FROM ingredient_categories WHERE key = 'sugars')
    """)

    for table <-
          ~w(category_feature_types product_feature_values lot_feature_values ingredient_feature_values) do
      execute("DELETE FROM #{table} WHERE feature_type_id IN (#{types})")
    end

    execute("DELETE FROM feature_types WHERE key IN (#{keys})")
    execute("UPDATE feature_types SET decimals = 1 WHERE key = 'extract_fgdb'")

    alter table(:supplier_offers) do
      remove :pack_note
    end

    alter table(:category_feature_types) do
      remove :only_form
    end
  end
end
