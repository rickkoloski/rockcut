defmodule RockcutApi.Repo.Migrations.CreateBrewhouses do
  use Ecto.Migration

  def change do
    create table(:brewhouses) do
      add :name, :string, null: false
      add :is_default, :boolean, default: false
      add :notes, :text

      # UOM Preferences
      add :temp_unit, :string, default: "F"
      add :liquid_vol_unit, :string, default: "bbls"
      add :density_unit, :string, default: "sg"
      add :alcohol_unit, :string, default: "abv"
      add :density_calc_method, :string, default: "ppg"
      add :ibu_calc_method, :string, default: "tinseth"
      add :ingredient_weight_unit, :string, default: "lb"
      add :ingredient_vol_unit, :string, default: "gal"

      # Equipment Values
      add :kettle_turn_size, :decimal
      add :kettle_evaporation_rate, :decimal
      add :kettle_loss, :decimal
      add :ferm_loss, :decimal

      timestamps(type: :utc_datetime)
    end

    create unique_index(:brewhouses, [:name])
  end
end
