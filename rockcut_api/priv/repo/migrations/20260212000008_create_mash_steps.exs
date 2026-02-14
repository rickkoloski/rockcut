defmodule RockcutApi.Repo.Migrations.CreateMashSteps do
  use Ecto.Migration

  def change do
    create table(:mash_steps) do
      add :recipe_id, references(:recipes, on_delete: :delete_all), null: false
      add :step_number, :integer, null: false
      add :name, :string, null: false
      add :temperature, :decimal, null: false
      add :duration, :integer, null: false
      add :type, :string, null: false, default: "infusion"
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:mash_steps, [:recipe_id])
    create unique_index(:mash_steps, [:recipe_id, :step_number])
  end
end
