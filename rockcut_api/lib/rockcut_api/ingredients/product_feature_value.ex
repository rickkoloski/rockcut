defmodule RockcutApi.Ingredients.ProductFeatureValue do
  @moduledoc """
  D60 §3.4: a maltster product's standard value for one feature, in the
  feature's unit. `entered_value`/`entered_unit` keep what was typed when a
  conversion was used ("entered as 37.5 PPG").
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "product_feature_values" do
    field :value, :decimal
    field :entered_value, :decimal
    field :entered_unit, :string

    belongs_to :product, RockcutApi.Ingredients.Product
    belongs_to :feature_type, RockcutApi.Ingredients.FeatureType

    timestamps(type: :utc_datetime)
  end

  def changeset(value, attrs) do
    value
    |> cast(attrs, [:product_id, :feature_type_id, :value, :entered_value, :entered_unit])
    |> validate_required([:product_id, :feature_type_id, :value])
    |> unique_constraint([:product_id, :feature_type_id])
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:feature_type_id)
    |> RockcutApi.Changeset.validate_parents([:product_id, :feature_type_id])
  end
end
