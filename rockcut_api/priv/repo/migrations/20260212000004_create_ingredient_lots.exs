defmodule RockcutApi.Repo.Migrations.CreateIngredientLots do
  use Ecto.Migration

  def change do
    create table(:ingredient_lots) do
      add :ingredient_id, references(:ingredients, on_delete: :restrict), null: false
      add :lot_number, :string
      add :supplier, :string
      add :received_date, :date
      add :status, :string, null: false, default: "available"

      # Calc fields for recipe math
      add :alpha_acid, :decimal
      add :color_lovibond, :decimal
      add :potential_gravity, :decimal
      add :attenuation, :decimal

      # Dynamic fields validated against category field definitions
      add :properties, :text
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:ingredient_lots, [:ingredient_id])
    create index(:ingredient_lots, [:status])
  end
end
