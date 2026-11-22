defmodule RockcutApi.Ingredients.IngredientFeatureValue do
  @moduledoc """
  D65 (salts amendment, decision 1): a feature value on an ingredient, not a
  product: a salt's ion contribution (ppm @ 1 g/gal) is chemistry, the same
  for every brand. Written through `Ingredients.Ions`.
  """
  use Ecto.Schema

  schema "ingredient_feature_values" do
    field :value, :decimal

    belongs_to :ingredient, RockcutApi.Brewing.Ingredient
    belongs_to :feature_type, RockcutApi.Ingredients.FeatureType

    timestamps(type: :utc_datetime)
  end
end
