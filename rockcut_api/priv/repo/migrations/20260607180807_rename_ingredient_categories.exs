defmodule RockcutApi.Repo.Migrations.RenameIngredientCategories do
  use Ecto.Migration

  def up do
    execute "UPDATE ingredient_categories SET name = 'Grains'              WHERE name = 'Grain'"
    execute "UPDATE ingredient_categories SET name = 'Future Ingredients'  WHERE name = 'Extract'"
    execute "UPDATE ingredient_categories SET name = 'Hops'                WHERE name = 'Hop'"
    execute "UPDATE ingredient_categories SET name = 'Yeast Strains'       WHERE name = 'Yeast'"
    execute "UPDATE ingredient_categories SET name = 'Fruits'              WHERE name = 'Fruit'"
    execute "UPDATE ingredient_categories SET name = 'Spices & Flavorings' WHERE name = 'Spice'"
    execute "UPDATE ingredient_categories SET name = 'Sugars and Extracts' WHERE name = 'Sugar'"
    execute "UPDATE ingredient_categories SET name = 'Other Consumables'   WHERE name = 'Adjunct'"
  end

  def down do
    execute "UPDATE ingredient_categories SET name = 'Grain'   WHERE name = 'Grains'"
    execute "UPDATE ingredient_categories SET name = 'Extract' WHERE name = 'Future Ingredients'"
    execute "UPDATE ingredient_categories SET name = 'Hop'     WHERE name = 'Hops'"
    execute "UPDATE ingredient_categories SET name = 'Yeast'   WHERE name = 'Yeast Strains'"
    execute "UPDATE ingredient_categories SET name = 'Fruit'   WHERE name = 'Fruits'"
    execute "UPDATE ingredient_categories SET name = 'Spice'   WHERE name = 'Spices & Flavorings'"
    execute "UPDATE ingredient_categories SET name = 'Sugar'   WHERE name = 'Sugars and Extracts'"
    execute "UPDATE ingredient_categories SET name = 'Adjunct' WHERE name = 'Other Consumables'"
  end
end
