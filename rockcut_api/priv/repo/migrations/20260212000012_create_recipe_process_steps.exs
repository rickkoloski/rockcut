defmodule RockcutApi.Repo.Migrations.CreateRecipeProcessSteps do
  use Ecto.Migration

  def change do
    create table(:recipe_process_steps) do
      add :recipe_id, references(:recipes, on_delete: :delete_all), null: false
      add :step_number, :integer, null: false
      add :name, :string, null: false
      add :day, :integer
      add :temperature, :decimal
      add :duration, :integer
      add :duration_unit, :string, null: false, default: "minutes"
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:recipe_process_steps, [:recipe_id])
    create unique_index(:recipe_process_steps, [:recipe_id, :step_number])
  end
end
