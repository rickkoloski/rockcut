defmodule RockcutApi.Repo.Migrations.CreateCategoryFieldDefinitions do
  use Ecto.Migration

  def change do
    create table(:category_field_definitions) do
      add :category_id, references(:ingredient_categories, on_delete: :delete_all), null: false
      add :field_name, :string, null: false
      add :field_type, :string, null: false
      add :options, :string
      add :required, :boolean, null: false, default: false
      add :sort_order, :integer, null: false, default: 0

      timestamps(type: :utc_datetime)
    end

    create index(:category_field_definitions, [:category_id])
    create unique_index(:category_field_definitions, [:category_id, :field_name])
  end
end
