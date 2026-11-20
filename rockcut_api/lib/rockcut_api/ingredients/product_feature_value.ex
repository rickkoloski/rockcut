defmodule RockcutApi.Ingredients.ProductFeatureValue do
  @moduledoc """
  D60 §3.4: a product's standard value for one feature, in the
  feature's unit. `entered_value`/`entered_unit` keep what was typed when a
  conversion was used ("entered as 37.5 PPG"). D62 §3.4: a range (hops'
  typical alpha, beta and oil) is `value` (low) to `value_high`, either of
  them blank.
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "product_feature_values" do
    field :value, :decimal
    field :value_high, :decimal
    field :entered_value, :decimal
    field :entered_unit, :string

    belongs_to :product, RockcutApi.Ingredients.Product
    belongs_to :feature_type, RockcutApi.Ingredients.FeatureType

    timestamps(type: :utc_datetime)
  end

  def changeset(value, attrs) do
    value
    |> cast(attrs, [
      :product_id,
      :feature_type_id,
      :value,
      :value_high,
      :entered_value,
      :entered_unit
    ])
    |> validate_required([:product_id, :feature_type_id])
    |> unique_constraint([:product_id, :feature_type_id])
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:feature_type_id)
    |> RockcutApi.Changeset.validate_parents([:product_id, :feature_type_id])
  end
end
