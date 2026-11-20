defmodule RockcutApi.Repo.Migrations.AddKeyToIngredientCategories do
  @moduledoc """
  D62 (plan, Stage 1): a stable key on each top-level ingredient category,
  so the rules per category (`Ingredients.Catalog`) never depend on a name
  someone can change in Settings. Set by today's names; children have none.
  `down` drops the column.
  """
  use Ecto.Migration

  @keys [
    {"Grains", "grains"},
    {"Hops", "hops"},
    {"Fruits", "fruits"},
    {"Spices & Flavorings", "spices"},
    {"Sugars and Extracts", "sugars"},
    {"Other Consumables", "consumables"},
    {"Yeast Strains", "yeast"},
    {"Future Ingredients", "future"}
  ]

  def up do
    alter table(:ingredient_categories) do
      add :key, :string
    end

    create unique_index(:ingredient_categories, [:key])

    flush()

    for {name, key} <- @keys do
      execute(
        "UPDATE ingredient_categories SET key = '#{key}' " <>
          "WHERE name = '#{String.replace(name, "'", "''")}' AND parent_id IS NULL"
      )
    end
  end

  def down do
    drop index(:ingredient_categories, [:key])

    alter table(:ingredient_categories) do
      remove :key
    end
  end
end
