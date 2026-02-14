defmodule RockcutApi.Repo.Migrations.CreateWaterProfiles do
  use Ecto.Migration

  def change do
    create table(:water_profiles) do
      add :recipe_id, references(:recipes, on_delete: :delete_all), null: false
      add :calcium, :decimal
      add :magnesium, :decimal
      add :sodium, :decimal
      add :sulfate, :decimal
      add :chloride, :decimal
      add :bicarbonate, :decimal
      add :ph_target, :decimal
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create unique_index(:water_profiles, [:recipe_id])
  end
end
