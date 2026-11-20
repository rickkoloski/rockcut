defmodule RockcutApi.Repo.Migrations.HopFeaturesAndCropYear do
  @moduledoc """
  D62 §3.1, §3.4 (plan, Stage 2): hops join the product model.

    * A hop lot must be a lot of a product from now on, so any Hops lot
      without one stops the migration with a message that lists them (prod
      is expected to have none; DEV and local reseed).
    * `category_feature_types` says where each feature lives in a category:
      `product_mode` (`none`, `value`: a standard as grain has, `range`: a
      typical low–high), `lot_mode` (`none`, `copy`: a new lot copies the
      standard, `enter`: typed for each lot), `lot_required`, and
      `only_unit` (the feature applies only to products in that unit;
      Stage 3's sugars). Existing rows are grain's: `value` and `copy`.
    * `product_feature_values.value` may be null and `value_high` is new: a
      range's two ends, either of them blank. SQLite can't drop a NOT NULL,
      so the table is rebuilt (nothing points at it).
    * Feature types Beta acid (%, 2 decimals) and Total oil (mL/100 g, 0–10,
      2 decimals); Alpha acid widens to 2 decimals (stored values don't
      change).
    * Hops: alpha, beta and oil are a range on the product and a value
      entered on each lot, alpha required (A2).
    * `ingredient_lots.crop_year`.
    * The Hops custom fields (Form, Origin, Crop Year) go: form and origin
      are on the product now, the crop year on the lot. No value was ever
      stored for them (D60 dropped `properties`).

  `down` puts the columns, decimals and fields back, and deletes the two
  feature types with their values; a range's low end stays as the value
  (a range with only a high end is dropped).
  """
  use Ecto.Migration

  @now "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"

  # {key, label, unit label, min, max, decimals}
  @new_types [
    {"beta_acid_pct", "Beta acid", "%", 0, 100, 2},
    {"total_oil_ml_100g", "Total oil", "mL/100 g", 0, 10, 2}
  ]

  # Hops' features: {key, sort order, lot required}
  @hops [
    {"alpha_acid_pct", 0, true},
    {"beta_acid_pct", 1, false},
    {"total_oil_ml_100g", 2, false}
  ]

  @hops_ids "SELECT id FROM ingredient_categories WHERE key = 'hops'"

  def up do
    execute(&no_loose_hop_lots!/0)

    alter table(:category_feature_types) do
      add :product_mode, :string, null: false, default: "value"
      add :lot_mode, :string, null: false, default: "copy"
      add :lot_required, :boolean, null: false, default: false
      add :only_unit, :string
    end

    rebuild_product_values("value DECIMAL, value_high DECIMAL", "value, NULL", "")

    alter table(:ingredient_lots) do
      add :crop_year, :integer
    end

    for {key, label, unit, min, max, decimals} <- @new_types do
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

    execute("UPDATE feature_types SET decimals = 2 WHERE key = 'alpha_acid_pct'")

    for {key, sort_order, required} <- @hops do
      execute("""
      INSERT INTO category_feature_types
        (category_id, feature_type_id, sort_order, required, product_mode, lot_mode,
         lot_required, inserted_at, updated_at)
      SELECT c.id, f.id, #{sort_order}, false, 'range', 'enter', #{required}, #{@now}, #{@now}
      FROM ingredient_categories c, feature_types f
      WHERE c.key = 'hops' AND f.key = '#{key}'
      ON CONFLICT (category_id, feature_type_id) DO UPDATE SET
        product_mode = 'range', lot_mode = 'enter', lot_required = #{required},
        sort_order = #{sort_order}
      """)
    end

    execute("DELETE FROM category_field_definitions WHERE category_id IN (#{@hops_ids})")
  end

  def down do
    for {name, type, options, sort_order} <- [
          {"Form", "dropdown", "Pellet, Whole Leaf, Cryo, Extract", 0},
          {"Origin", "text", nil, 1},
          {"Crop Year", "text", nil, 2}
        ] do
      execute(fn ->
        repo().query!(
          """
          INSERT INTO category_field_definitions
            (category_id, field_name, field_type, options, required, sort_order, inserted_at, updated_at)
          SELECT id, ?, ?, ?, false, ?, #{@now}, #{@now} FROM ingredient_categories WHERE key = 'hops'
          """,
          [name, type, options, sort_order]
        )
      end)
    end

    execute("""
    DELETE FROM category_feature_types
    WHERE feature_type_id IN (SELECT id FROM feature_types WHERE key IN ('beta_acid_pct', 'total_oil_ml_100g'))
    """)

    for table <- ~w(product_feature_values lot_feature_values) do
      execute("""
      DELETE FROM #{table}
      WHERE feature_type_id IN (SELECT id FROM feature_types WHERE key IN ('beta_acid_pct', 'total_oil_ml_100g'))
      """)
    end

    execute("DELETE FROM feature_types WHERE key IN ('beta_acid_pct', 'total_oil_ml_100g')")
    execute("UPDATE feature_types SET decimals = 1 WHERE key = 'alpha_acid_pct'")

    alter table(:ingredient_lots) do
      remove :crop_year
    end

    rebuild_product_values("value DECIMAL NOT NULL", "value", "WHERE value IS NOT NULL")

    alter table(:category_feature_types) do
      remove :only_unit
      remove :lot_required
      remove :lot_mode
      remove :product_mode
    end
  end

  # The table again with `value_columns` in place of its value column(s),
  # copying `select` from the old one (rows matching `where`), its index too.
  defp rebuild_product_values(value_columns, select, where) do
    execute("""
    CREATE TABLE "product_feature_values_new" ("id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "product_id" INTEGER NOT NULL CONSTRAINT "product_feature_values_product_id_fkey"
        REFERENCES "ingredient_products"("id") ON DELETE CASCADE,
      "feature_type_id" INTEGER NOT NULL CONSTRAINT "product_feature_values_feature_type_id_fkey"
        REFERENCES "feature_types"("id") ON DELETE RESTRICT,
      #{value_columns}, "entered_value" DECIMAL, "entered_unit" TEXT,
      "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL)
    """)

    execute("""
    INSERT INTO product_feature_values_new
    SELECT id, product_id, feature_type_id, #{select}, entered_value, entered_unit, inserted_at, updated_at
    FROM product_feature_values #{where}
    """)

    execute("DROP TABLE product_feature_values")
    execute("ALTER TABLE product_feature_values_new RENAME TO product_feature_values")

    execute("""
    CREATE UNIQUE INDEX "product_feature_values_product_id_feature_type_id_index"
      ON "product_feature_values" ("product_id", "feature_type_id")
    """)
  end

  # D62 §7: a lot in Hops (or a child of it) with no product can't carry on.
  defp no_loose_hop_lots! do
    %{rows: rows} =
      repo().query!("""
      SELECT l.id, coalesce(l.lot_number, ''), i.name
      FROM ingredient_lots l
      JOIN ingredients i ON i.id = l.ingredient_id
      JOIN ingredient_categories c ON c.id = i.category_id
      LEFT JOIN ingredient_categories p ON p.id = c.parent_id
      WHERE l.product_id IS NULL AND (c.key = 'hops' OR p.key = 'hops')
      ORDER BY l.id
      """)

    if rows != [] do
      lots = Enum.map_join(rows, "; ", fn [id, number, name] -> "##{id} #{name} #{number}" end)

      raise """
      D62: #{length(rows)} Hops lot(s) have no product. A hop lot is now a lot of a \
      product (manufacturer + form). Give each a product, or delete it, then migrate \
      again: #{lots}
      """
    end
  end
end
