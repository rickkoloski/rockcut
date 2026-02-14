defmodule RockcutApi.Repo.Migrations.CreateBatches do
  use Ecto.Migration

  def change do
    create table(:batches) do
      add :brand_id, references(:brands, on_delete: :restrict), null: false
      add :batch_number, :string, null: false
      add :status, :string, null: false, default: "planned"

      # Blended actuals (measured in fermenter after all turns)
      add :actual_og, :decimal
      add :actual_fg, :decimal
      add :actual_abv, :decimal
      add :actual_volume, :decimal

      # Fermentation
      add :ferm_start_date, :date
      add :ferm_end_date, :date
      add :ferm_temp, :decimal

      # Packaging
      add :package_date, :date
      add :package_type, :string

      # Tasting
      add :rating, :integer
      add :tasting_notes, :text
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:batches, [:brand_id])
    create unique_index(:batches, [:batch_number])
  end
end
