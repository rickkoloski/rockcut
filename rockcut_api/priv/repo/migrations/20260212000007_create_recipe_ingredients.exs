defmodule RockcutApi.Repo.Migrations.CreateRecipeIngredients do
  use Ecto.Migration

  def change do
    create table(:recipe_ingredients) do
      add :recipe_id, references(:recipes, on_delete: :delete_all), null: false
      add :lot_id, references(:ingredient_lots, on_delete: :restrict), null: false
      add :amount, :decimal, null: false
      add :unit, :string, null: false
      add :use, :string
      add :time_minutes, :integer
      add :sort_order, :integer, null: false, default: 0
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:recipe_ingredients, [:recipe_id])
    create index(:recipe_ingredients, [:lot_id])
  end
end
