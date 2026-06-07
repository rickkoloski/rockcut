defmodule RockcutApi.Repo.Migrations.UpdateIngredientLotsGrainFields do
  use Ecto.Migration

  def up do
    rename table(:ingredient_lots), :potential_gravity, to: :extract_potential_fgdb

    alter table(:ingredient_lots) do
      add :maltster, :string
      add :protein_perc, :decimal
      add :moisture_perc, :decimal
      add :order_name, :string
      add :order_unit_size, :string
    end
  end

  def down do
    alter table(:ingredient_lots) do
      remove :order_unit_size
      remove :order_name
      remove :moisture_perc
      remove :protein_perc
      remove :maltster
    end

    rename table(:ingredient_lots), :extract_potential_fgdb, to: :potential_gravity
  end
end
