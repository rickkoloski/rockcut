defmodule RockcutApi.Ingredients.LotFeatureValue do
  @moduledoc """
  D60 §3.4: a lot's value for one feature, copied from the product's
  standard when the lot is made and changeable per lot. `entered_value`/
  `entered_unit` as `ProductFeatureValue`.
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "lot_feature_values" do
    field :value, :decimal
    field :entered_value, :decimal
    field :entered_unit, :string

    belongs_to :lot, RockcutApi.Brewing.IngredientLot
    belongs_to :feature_type, RockcutApi.Ingredients.FeatureType

    timestamps(type: :utc_datetime)
  end

  def changeset(value, attrs) do
    value
    |> cast(attrs, [:lot_id, :feature_type_id, :value, :entered_value, :entered_unit])
    |> validate_required([:lot_id, :feature_type_id, :value])
    |> unique_constraint([:lot_id, :feature_type_id])
    |> foreign_key_constraint(:lot_id)
    |> foreign_key_constraint(:feature_type_id)
    |> RockcutApi.Changeset.validate_parents([:lot_id, :feature_type_id])
  end
end
