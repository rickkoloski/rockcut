defmodule RockcutApi.Ingredients.CategoryFeatureType do
  @moduledoc """
  D60 §3.4: a feature that applies to a category (and its children), in
  `sort_order`, optionally required.
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "category_feature_types" do
    field :sort_order, :integer, default: 0
    field :required, :boolean, default: false

    belongs_to :category, RockcutApi.Brewing.IngredientCategory
    belongs_to :feature_type, RockcutApi.Ingredients.FeatureType

    timestamps(type: :utc_datetime)
  end

  def changeset(applicability, attrs) do
    applicability
    |> cast(attrs, [:category_id, :feature_type_id, :sort_order, :required])
    |> validate_required([:category_id, :feature_type_id])
    |> unique_constraint([:category_id, :feature_type_id])
    |> foreign_key_constraint(:category_id)
    |> foreign_key_constraint(:feature_type_id)
    |> RockcutApi.Changeset.validate_parents([:category_id, :feature_type_id])
  end
end
