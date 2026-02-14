defmodule RockcutApi.Repo.Migrations.CreateIngredientCategories do
  use Ecto.Migration

  def change do
    create table(:ingredient_categories) do
      add :name, :string, null: false
      add :sort_order, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create unique_index(:ingredient_categories, [:name])
  end
end
