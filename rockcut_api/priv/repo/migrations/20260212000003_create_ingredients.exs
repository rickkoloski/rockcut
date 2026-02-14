defmodule RockcutApi.Repo.Migrations.CreateIngredients do
  use Ecto.Migration

  def change do
    create table(:ingredients) do
      add :name, :string, null: false
      add :category_id, references(:ingredient_categories, on_delete: :restrict), null: false
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:ingredients, [:category_id])
    create unique_index(:ingredients, [:name, :category_id])
  end
end
