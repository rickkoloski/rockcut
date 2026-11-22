defmodule RockcutApi.Repo.Migrations.IngredientFeatureValuesAndFormula do
  @moduledoc """
  D65 plan migration 3 (spec, salts amendment, decision 1): ion
  contributions are chemistry, the same for every brand, so they sit on the
  ingredient, not the product. `ingredient_feature_values` holds one value
  per ingredient and feature type, and goes with its ingredient. The ion
  feature types and the screens come in Stop 2; this adds the table and the
  ingredient's optional `formula` ("CaSO₄·2H₂O", at most 40 characters, the
  changeset's rule). Additive.
  """
  use Ecto.Migration

  def change do
    create table(:ingredient_feature_values) do
      add :ingredient_id, references(:ingredients, on_delete: :delete_all), null: false
      add :feature_type_id, references(:feature_types, on_delete: :restrict), null: false
      add :value, :decimal

      timestamps(type: :utc_datetime)
    end

    create unique_index(:ingredient_feature_values, [:ingredient_id, :feature_type_id])
    create index(:ingredient_feature_values, [:feature_type_id])

    alter table(:ingredients) do
      add :formula, :string
    end
  end
end
