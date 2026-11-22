defmodule RockcutApi.Repo.Migrations.D65Categories do
  @moduledoc """
  D65 plan migration 6 (spec §4.1, the acids and Irish Moss amendments).
  Every step goes by name or key and is idempotent:

    * stop, naming them, when a lot in a D65 category (Fruits, Spices &
      Flavorings, Sugars and Extracts, Other Consumables and its children)
      has no product: D65 lots belong to a product;
    * Water Salts and Finings under Other Consumables (no Acids);
    * Whirlfloc into Finings when it's at the top of Other Consumables;
    * "Corn Sugar (Dextrose)" → "Dextrose (Corn Sugar)";
    * Irish Moss deleted when it has no products, lots or recipe lines
      (a recipe line points at a lot, so no lots covers them too);
    * Future Ingredients deleted when it holds no ingredients or children;
    * the Form field definitions on Fruits, Spices & Flavorings and Sugars
      and Extracts deleted (no screen ever stored a value).

  Anything kept is logged (`Logger.warning`) with its name, for the release
  notes. `down` puts back what `up` changed that the D62 image reads: the
  children go (once empty, Whirlfloc back on top), the old Dextrose name,
  Future Ingredients and the three Form fields. Irish Moss isn't recreated:
  the D62 seed adds it again.
  """
  use Ecto.Migration
  require Logger

  @d65_keys ~w(fruits spices sugars consumables)
  @form_keys ~w(fruits spices sugars)
  @children [{"Water Salts", 0}, {"Finings", 1}]
  @old_dextrose "Corn Sugar (Dextrose)"
  @new_dextrose "Dextrose (Corn Sugar)"
  @old_forms %{
    "fruits" => "Fresh, Puree, Frozen, Extract",
    "spices" => "Whole, Ground, Extract",
    "sugars" => "Granulated, Liquid, Syrup"
  }

  def up do
    stop_on_lots_without_product!()

    consumables = category_id("consumables")

    if consumables do
      for {name, sort_order} <- @children, do: add_child(name, sort_order, consumables)
      move_whirlfloc(consumables)
    else
      # A brand-new database has no categories yet (the seeds add them).
      if one("SELECT count(*) FROM ingredient_categories", []) > 0,
        do:
          Logger.warning(
            "D65: no Other Consumables category (key consumables); no children added"
          )
    end

    rename_dextrose(@old_dextrose, @new_dextrose)
    remove_irish_moss()
    remove_future()
    if consumables, do: log_strays(consumables)

    for key <- @form_keys, id = category_id(key) do
      repo().query!(
        "DELETE FROM category_field_definitions WHERE category_id = ? AND field_name = 'Form'",
        [id]
      )
    end
  end

  def down do
    consumables = category_id("consumables")

    if consumables do
      finings = child_id("Finings", consumables)

      if finings do
        repo().query!(
          "UPDATE ingredients SET category_id = ? WHERE name = 'Whirlfloc' AND category_id = ?",
          [consumables, finings]
        )
      end

      for {name, _} <- @children, id = child_id(name, consumables) do
        if one("SELECT count(*) FROM ingredients WHERE category_id = ?", [id]) == 0,
          do: repo().query!("DELETE FROM ingredient_categories WHERE id = ?", [id])
      end
    end

    rename_dextrose(@new_dextrose, @old_dextrose)

    unless category_id("future") do
      repo().query!(
        "INSERT INTO ingredient_categories (name, key, sort_order, inserted_at, updated_at) " <>
          "VALUES ('Future Ingredients', 'future', 1, ?, ?)",
        [now(), now()]
      )
    end

    for {key, options} <- @old_forms, id = category_id(key) do
      repo().query!(
        "INSERT OR IGNORE INTO category_field_definitions " <>
          "(category_id, field_name, field_type, options, required, sort_order, inserted_at, updated_at) " <>
          "VALUES (?, 'Form', 'dropdown', ?, false, 0, ?, ?)",
        [id, options, now(), now()]
      )
    end
  end

  # The D65 categories: the four tops by key and every child of theirs.
  defp d65_category_ids do
    keys = Enum.map_join(@d65_keys, ", ", &"'#{&1}'")

    repo().query!("""
    SELECT c.id FROM ingredient_categories c
    LEFT JOIN ingredient_categories p ON p.id = c.parent_id
    WHERE c.key IN (#{keys}) OR p.key IN (#{keys})
    """).rows
    |> List.flatten()
  end

  defp stop_on_lots_without_product! do
    case d65_category_ids() do
      [] ->
        :ok

      ids ->
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
            Enum.map_join(rows, "; ", fn [id, number, name] ->
              "#{name} lot #{number || "##{id}"}"
            end)

          raise "D65: these lots have no product; give each a product (or remove them) first: #{lots}"
        end
    end
  end

  defp add_child(name, sort_order, parent) do
    case repo().query!("SELECT id, parent_id FROM ingredient_categories WHERE name = ?", [name]).rows do
      [] ->
        repo().query!(
          "INSERT INTO ingredient_categories (name, parent_id, sort_order, inserted_at, updated_at) " <>
            "VALUES (?, ?, ?, ?, ?)",
          [name, parent, sort_order, now(), now()]
        )

      [[_id, ^parent]] ->
        :ok

      [[_id, _other]] ->
        Logger.warning(
          "D65: kept category #{name}: the name is taken elsewhere; not added under Other Consumables"
        )
    end
  end

  defp move_whirlfloc(consumables) do
    finings = child_id("Finings", consumables)

    cond do
      is_nil(finings) ->
        :ok

      one("SELECT count(*) FROM ingredients WHERE name = 'Whirlfloc' AND category_id = ?", [
        finings
      ]) > 0 ->
        :ok

      true ->
        repo().query!(
          "UPDATE ingredients SET category_id = ? WHERE name = 'Whirlfloc' AND category_id = ?",
          [finings, consumables]
        )
    end
  end

  # Anything still at the top of Other Consumables, for the release notes.
  defp log_strays(consumables) do
    for [name] <-
          repo().query!("SELECT name FROM ingredients WHERE category_id = ? ORDER BY name", [
            consumables
          ]).rows do
      Logger.warning("D65: kept ingredient #{name} at the top of Other Consumables")
    end
  end

  defp rename_dextrose(from, to) do
    case category_id("sugars") do
      nil ->
        :ok

      sugars ->
        if one("SELECT count(*) FROM ingredients WHERE name = ? AND category_id = ?", [to, sugars]) ==
             0 do
          repo().query!(
            "UPDATE ingredients SET name = ?, updated_at = ? WHERE name = ? AND category_id = ?",
            [to, now(), from, sugars]
          )
        end
    end
  end

  defp remove_irish_moss do
    for [id] <- repo().query!("SELECT id FROM ingredients WHERE name = 'Irish Moss'").rows do
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
          "D65: kept ingredient Irish Moss: #{products} products, #{lots} lots, #{recipe_lines} recipe lines"
        )
      end
    end
  end

  defp remove_future do
    case category_id("future") do
      nil ->
        :ok

      id ->
        names =
          repo().query!("SELECT name FROM ingredients WHERE category_id = ? ORDER BY name", [id]).rows
          |> List.flatten()

        children = one("SELECT count(*) FROM ingredient_categories WHERE parent_id = ?", [id])

        if names == [] and children == 0 do
          repo().query!("DELETE FROM ingredient_categories WHERE id = ?", [id])
        else
          Logger.warning(
            "D65: kept category Future Ingredients: ingredients #{Enum.join(names, ", ")}; #{children} subcategories"
          )
        end
    end
  end

  defp category_id(key) do
    one("SELECT id FROM ingredient_categories WHERE key = ?", [key])
  end

  defp child_id(name, parent) do
    one("SELECT id FROM ingredient_categories WHERE name = ? AND parent_id = ?", [name, parent])
  end

  defp one(sql, params) do
    case repo().query!(sql, params).rows do
      [[value]] -> value
      [] -> nil
    end
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
end
