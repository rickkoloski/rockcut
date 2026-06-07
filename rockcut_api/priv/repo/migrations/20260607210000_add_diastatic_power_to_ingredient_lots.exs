defmodule RockcutApi.Repo.Migrations.AddDiastaticPowerToIngredientLots do
  use Ecto.Migration

  def change do
    alter table(:ingredient_lots) do
      add :diastatic_power_linter, :decimal
    end
  end
end
