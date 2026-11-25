defmodule RockcutApi.Repo.Migrations.CreateBrewerySettings do
  @moduledoc """
  D63 §6.1: the brewery's settings, one row (`id` 1, checked) with the values
  they start at. `RockcutApi.BrewerySettings` makes the row again, with the
  same values, if it's missing.
  """
  use Ecto.Migration

  def up do
    create table(:brewery_settings, primary_key: false) do
      add :id, :integer,
        primary_key: true,
        check: %{name: "brewery_settings_one_row", expr: "id = 1"}

      add :boil_temp_f, :decimal, null: false
      add :ibu_equation_hold, :string, null: false
      add :ibu_equation_print, :string, null: false
      add :ibu_tolerance, :decimal, null: false
      add :pellet_factor, :decimal, null: false
      add :hop_stand_temp_f, :decimal, null: false
      add :hop_stand_cooling_min, :decimal, null: false
      add :hop_stand_whirl_min, :decimal, null: false
      add :hop_stand_rest_min, :decimal, null: false
      add :whirlpool_whirl_min, :decimal, null: false
      add :whirlpool_rest_min, :decimal, null: false
      add :evaporation_bbl_per_hr, :decimal, null: false
      add :kettle_loss_bbl, :decimal, null: false
      add :fermenter_loss_bbl, :decimal, null: false
      add :whirlfloc_tablets_per_bbl, :decimal, null: false
      add :clarity_ferm_ml_per_plato_bbl, :decimal, null: false
      add :zinc_g_per_bbl, :decimal, null: false
      add :pitch_rate, :decimal, null: false
      add :source_water_name, :string, null: false
      add :water_ca_ppm, :decimal, null: false
      add :water_mg_ppm, :decimal, null: false
      add :water_na_ppm, :decimal, null: false
      add :water_co3_ppm, :decimal, null: false
      add :water_hco3_ppm, :decimal, null: false
      add :water_so4_ppm, :decimal, null: false
      add :water_cl_ppm, :decimal, null: false
      add :lock_version, :integer, null: false, default: 1
      add :updated_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    execute """
    INSERT INTO brewery_settings (
      id, boil_temp_f, ibu_equation_hold, ibu_equation_print, ibu_tolerance, pellet_factor,
      hop_stand_temp_f, hop_stand_cooling_min, hop_stand_whirl_min, hop_stand_rest_min,
      whirlpool_whirl_min, whirlpool_rest_min,
      evaporation_bbl_per_hr, kettle_loss_bbl, fermenter_loss_bbl,
      whirlfloc_tablets_per_bbl, clarity_ferm_ml_per_plato_bbl, zinc_g_per_bbl, pitch_rate,
      source_water_name, water_ca_ppm, water_mg_ppm, water_na_ppm, water_co3_ppm,
      water_hco3_ppm, water_so4_ppm, water_cl_ppm, lock_version, inserted_at, updated_at
    ) VALUES (
      1, 202, 'rc_2026', 'rc_2026', 2.0, 1.1,
      170, 15, 20, 20,
      20, 20,
      0.23, 0.21, 0.5,
      2, 1.3333, 0.09375, 1.5,
      'Estes Summer', 20, 3, 4, 0,
      18, 2, 3, 1, strftime('%Y-%m-%dT%H:%M:%S', 'now'), strftime('%Y-%m-%dT%H:%M:%S', 'now')
    )
    """
  end

  def down, do: drop(table(:brewery_settings))
end
