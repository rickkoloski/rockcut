defmodule RockcutApi.Repo.Migrations.CreateProcessProfiles do
  use Ecto.Migration

  def change do
    create table(:process_profiles) do
      add :name, :string, null: false
      add :description, :text

      # Mash
      add :mash_type, :string
      add :mash_foundation_water, :decimal
      add :strike_water_ratio, :decimal
      add :mash_ph, :decimal
      add :mash_schedule, :map

      # Lauter
      add :vorlauf_duration, :integer
      add :lauter_type, :string
      add :lauter_temperature, :decimal
      add :lauter_water, :decimal
      add :final_lauter_ph, :decimal
      add :lauter_duration, :integer

      # Boil & Post-Boil
      add :boil_duration, :integer
      add :coolpool, :boolean, default: false
      add :coolpool_temperature, :decimal
      add :coolpool_duration, :integer
      add :coolpool_rest_duration, :integer
      add :whirlpool_duration, :integer
      add :whirlpool_rest_duration, :integer
      add :knockout_duration, :integer
      add :knockout_temperature, :decimal

      # Fermentation
      add :lag_temperature, :decimal
      add :lag_duration, :decimal
      add :primary_temperature, :decimal
      add :primary_duration, :decimal
      add :secondary_temperature, :decimal
      add :secondary_duration, :decimal
      add :d_rest_temperature, :decimal
      add :d_rest_duration, :decimal

      # Cold Crash
      add :crash_type, :string
      add :crash_temperature, :decimal
      add :crash_duration, :decimal
      add :crash_steps, :map

      # Packaging
      add :transfer_type, :string
      add :bright_temperature, :decimal
      add :bright_duration, :decimal
      add :co2_volume, :decimal

      timestamps(type: :utc_datetime)
    end

    create unique_index(:process_profiles, [:name])
  end
end
