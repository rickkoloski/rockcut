defmodule RockcutApi.Repo.Migrations.D64YeastTidyUp do
  @moduledoc """
  D64 plan migration 3 (spec §4.1, Amendment 8). Every step goes by name or
  key and is idempotent:

    * stop, naming them, when a Yeast Strains lot has no product: yeast is
      managed from D64, and its lots belong to a product;
    * the five old Yeast Strains field definitions (Lab, Product Code, Temp
      Range Low (F), Temp Range High (F), Form) deleted: yeast uses products
      and features now. Any other field on it is kept and logged;
    * WLP001, Wyeast 1056 and WLP002 deleted when they have no products,
      lots or recipe lines (a recipe line points at a lot, so no lots covers
      them too). One in use is kept and logged (`Logger.warning "D64:
      kept …"`), for the release notes.

  US-05 → Chico Ale is the reference seed's (`seeds/d64_reference.exs`), as
  D65 did with Dextrose. `down` puts the five fields back; the three strains
  aren't recreated (the old seed added them).
  """
  use Ecto.Migration
  require Logger

  @old_fields [
    {"Lab", "text", nil, 0},
    {"Product Code", "text", nil, 1},
    {"Temp Range Low (F)", "number", nil, 2},
    {"Temp Range High (F)", "number", nil, 3},
    {"Form", "dropdown", "Dry, Liquid, Slurry", 4}
  ]

  @old_strains ["WLP001", "Wyeast 1056", "WLP002"]

  def up do
    case yeast_id() do
      nil ->
        :ok

      yeast ->
        stop_on_lots_without_product!(yeast)
        remove_fields(yeast)
        remove_strains(yeast)
    end
  end

  def down do
    case yeast_id() do
      nil ->
        :ok

      yeast ->
        for {name, type, options, sort_order} <- @old_fields do
          repo().query!(
            "INSERT OR IGNORE INTO category_field_definitions " <>
              "(category_id, field_name, field_type, options, required, sort_order, inserted_at, updated_at) " <>
              "VALUES (?, ?, ?, ?, false, ?, ?, ?)",
            [yeast, name, type, options, sort_order, now(), now()]
          )
        end
    end
  end

  # Yeast Strains and any child of it.
  defp category_ids(yeast) do
    repo().query!("SELECT id FROM ingredient_categories WHERE id = ? OR parent_id = ?", [
      yeast,
      yeast
    ]).rows
    |> List.flatten()
  end

  defp stop_on_lots_without_product!(yeast) do
    ids = category_ids(yeast)
    marks = Enum.map_join(ids, ", ", fn _ -> "?" end)

    rows =
      repo().query!(
        """
        SELECT l.id, l.lot_number, i.name FROM ingredient_lots l
        JOIN ingredients i ON i.id = l.ingredient_id
        WHERE l.product_id IS NULL AND i.category_id IN (#{marks})
        ORDER BY i.name, l.id
        """,
        ids
      ).rows

    if rows != [] do
      lots =
        Enum.map_join(rows, "; ", fn [id, number, name] -> "#{name} lot #{number || "##{id}"}" end)

      raise "D64: these yeast lots have no product; give each a product (or remove them) first: #{lots}"
    end
  end

  defp remove_fields(yeast) do
    for {name, _, _, _} <- @old_fields do
      repo().query!(
        "DELETE FROM category_field_definitions WHERE category_id = ? AND field_name = ?",
        [yeast, name]
      )
    end

    for [name] <-
          repo().query!(
            "SELECT field_name FROM category_field_definitions WHERE category_id = ? ORDER BY field_name",
            [yeast]
          ).rows do
      Logger.warning("D64: kept Yeast Strains field #{name}")
    end
  end

  defp remove_strains(yeast) do
    ids = category_ids(yeast)
    marks = Enum.map_join(ids, ", ", fn _ -> "?" end)

    for name <- @old_strains,
        [id] <-
          repo().query!(
            "SELECT id FROM ingredients WHERE name = ? AND category_id IN (#{marks})",
            [name | ids]
          ).rows do
      products = one("SELECT count(*) FROM ingredient_products WHERE ingredient_id = ?", [id])
      lots = one("SELECT count(*) FROM ingredient_lots WHERE ingredient_id = ?", [id])

      recipe_lines =
        one(
          "SELECT count(*) FROM recipe_ingredients r JOIN ingredient_lots l ON l.id = r.lot_id " <>
            "WHERE l.ingredient_id = ?",
          [id]
        )

      if products + lots + recipe_lines == 0 do
        repo().query!("DELETE FROM ingredients WHERE id = ?", [id])
      else
        Logger.warning(
          "D64: kept ingredient #{name}: #{products} products, #{lots} lots, #{recipe_lines} recipe lines"
        )
      end
    end
  end

  defp yeast_id, do: one("SELECT id FROM ingredient_categories WHERE key = 'yeast'", [])

  defp one(sql, params) do
    case repo().query!(sql, params).rows do
      [[value]] -> value
      [] -> nil
    end
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
end
