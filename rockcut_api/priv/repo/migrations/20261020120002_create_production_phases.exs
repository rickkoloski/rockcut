defmodule RockcutApi.Repo.Migrations.CreateProductionPhases do
  use Ecto.Migration

  # D46 §3.3: the phases a template starts, brewer-editable. Seeded here so
  # every environment (prod included) starts with Matt's list. `color` is a
  # palette token; the UI holds its light and dark values.
  @phases [
    {"Brew day", "brew"},
    {"Lag", "lag"},
    {"Fermentation", "ferm"},
    {"Diacetyl rest", "dr"},
    {"Crash", "crash"},
    {"Lagering", "lager"},
    {"Conditioning", "cond"},
    {"Carbonating", "carb"},
    {"Packaging", "pack"}
  ]

  def up do
    create table(:production_phases) do
      add :name, :string, null: false
      add :color, :string, null: false
      add :position, :integer, null: false, default: 0
      add :retired_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:production_phases, ["lower(name)"],
             name: :production_phases_lower_name_index
           )

    flush()

    now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    @phases
    |> Enum.with_index(1)
    |> Enum.each(fn {{name, color}, position} ->
      execute("""
      INSERT INTO production_phases (name, color, position, inserted_at, updated_at)
      VALUES ('#{name}', '#{color}', #{position}, '#{now}', '#{now}')
      """)
    end)
  end

  def down do
    drop table(:production_phases)
  end
end
