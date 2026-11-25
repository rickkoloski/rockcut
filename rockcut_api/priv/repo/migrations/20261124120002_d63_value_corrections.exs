defmodule RockcutApi.Repo.Migrations.D63ValueCorrections do
  @moduledoc """
  D63 §5.3: corrected standard values and one typical Brix. A value changes
  only where it still equals the old seed's (or is none, where the old is
  none); a value already new is fine as it is, and any other is left and
  logged, as is a product that isn't found or isn't the only one. Lots keep
  the values they copied. A changed product's `lock_version` goes up, so a
  dialog opened before can't put the old values back. No products at all (a
  fresh database): nothing happens. `down` does nothing (spec §9).
  """
  use Ecto.Migration
  require Logger

  # {ingredient, category key, maker (nil: None), form (nil: none),
  #  [{feature key, old (nil: none), new, range?}]}
  @corrections [
    {"Pilsner", "grains", "Root Shoot", nil,
     [
       {"moisture_pct", 5.0, 3.93, false},
       {"extract_fgdb", 80.8, 81.5, false},
       {"color_lovibond", 1.6, 1.85, false},
       {"protein_pct", 10.5, 11.62, false},
       {"diastatic_power_lintner", 125, 157, false}
     ]},
    {"Acidulated", "grains", "Weyermann", nil, [{"extract_fgdb", nil, 84.9, false}]},
    {"Oats, Flaked", "grains", "Grain Millers", nil, [{"extract_fgdb", nil, 81.5, false}]},
    {"DME", "sugars", "Muntons", "Dry", [{"extract_fgdb", 100, 96, false}]},
    {"Dextrose (Corn Sugar)", "sugars", nil, "Dry", [{"extract_fgdb", 91, 91.3, false}]},
    {"Lime", "fruits", nil, "Purée", [{"brix", nil, 8, true}]}
  ]

  def up do
    if rows("SELECT 1 FROM ingredient_products LIMIT 1", []) != [] do
      Enum.each(@corrections, &correct/1)
    end
  end

  def down, do: :ok

  defp correct({ingredient, key, maker, form, values}) do
    label = "#{ingredient} (#{maker || "None"})"

    case products(ingredient, key, maker, form) do
      [[id]] ->
        changed = Enum.count(values, &change(id, label, &1))

        if changed > 0 do
          repo().query!(
            "UPDATE ingredient_products SET lock_version = lock_version + 1, updated_at = ? WHERE id = ?",
            [now(), id]
          )
        end

      [] ->
        Logger.warning("D63: #{label} not found; its values weren't corrected")

      many ->
        Logger.warning("D63: #{label}: #{length(many)} products; its values weren't corrected")
    end
  end

  # The unnamed product of that ingredient, maker and form.
  defp products(ingredient, key, maker, form) do
    rows(
      """
      SELECT p.id FROM ingredient_products p
      JOIN ingredients i ON i.id = p.ingredient_id
      JOIN ingredient_categories c ON c.id = i.category_id
      LEFT JOIN ingredient_categories parent ON parent.id = c.parent_id
      LEFT JOIN parties m ON m.id = p.manufacturer_party_id
      WHERE lower(i.name) = lower(?) AND coalesce(c.key, parent.key) = ?
        AND coalesce(lower(m.name), '') = lower(?)
        AND coalesce(p.form, '') = ? AND coalesce(p.name, '') = ''
      """,
      [ingredient, key, maker || "", form || ""]
    )
  end

  # Whether it changed.
  defp change(product_id, label, {feature, old, new, range?}) do
    case rows("SELECT id FROM feature_types WHERE key = ?", [feature]) do
      [[type_id]] ->
        stored =
          rows(
            "SELECT id, value, value_high FROM product_feature_values " <>
              "WHERE product_id = ? AND feature_type_id = ?",
            [product_id, type_id]
          )

        change_value(stored, product_id, type_id, label, feature, old, new, range?)

      [] ->
        Logger.warning("D63: no feature #{feature}; #{label} wasn't corrected")
        false
    end
  end

  # Old is none: no row, or an empty one.
  defp change_value([], product_id, type_id, _label, _feature, nil, new, range?) do
    repo().query!(
      "INSERT INTO product_feature_values " <>
        "(product_id, feature_type_id, value, value_high, inserted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [product_id, type_id, new, if(range?, do: new), now(), now()]
    )

    true
  end

  defp change_value([[id, nil, nil]], _product_id, _type_id, _label, _feature, nil, new, range?),
    do: set(id, new, range?)

  defp change_value([[id, value, high]], _pid, _tid, label, feature, old, new, range?) do
    cond do
      same?(value, new) and (not range? or same?(high, new)) -> false
      old != nil and same?(value, old) and is_nil(high) -> set(id, new, range?)
      true -> left(label, feature, Enum.join(Enum.reject([value, high], &is_nil/1), "–"), old)
    end
  end

  defp change_value([], _pid, _tid, label, feature, old, _new, _range?),
    do: left(label, feature, "none", old)

  defp set(id, new, range?) do
    repo().query!(
      "UPDATE product_feature_values SET value = ?, value_high = ?, entered_value = NULL, " <>
        "entered_unit = NULL, updated_at = ? WHERE id = ?",
      [new, if(range?, do: new), now(), id]
    )

    true
  end

  defp left(label, feature, stored, old) do
    Logger.warning("D63: left #{label} #{feature} at #{stored} (expected #{old || "none"})")
    false
  end

  defp same?(nil, _), do: false
  defp same?(a, b), do: abs(a - b) < 1.0e-9

  defp rows(sql, params), do: repo().query!(sql, params).rows
  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
end
