defmodule RockcutApi.Repo.Migrations.CreateBrewTurns do
  use Ecto.Migration

  def change do
    create table(:brew_turns) do
      add :batch_id, references(:batches, on_delete: :delete_all), null: false
      add :recipe_id, references(:recipes, on_delete: :restrict), null: false
      add :turn_number, :integer, null: false
      add :brew_date, :date

      # Per-turn actuals
      add :actual_og, :decimal
      add :actual_volume, :decimal
      add :actual_efficiency, :decimal

      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:brew_turns, [:batch_id])
    create index(:brew_turns, [:recipe_id])
    create unique_index(:brew_turns, [:batch_id, :turn_number])
  end
end
