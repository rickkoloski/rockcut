defmodule RockcutApi.Ingredients.FeatureType do
  @moduledoc """
  D60 §3.4: a spec a product or lot can carry (Silverston's Product Feature
  with its unit of measure). Data, not columns, so D62 adds hop and yeast
  features without a migration. Every value is stored in `unit_label` and
  must lie in `min`..`max`; `decimals` is how many places the screens show.
  The seven are made by the `copy_lot_specs_to_features` migration.
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "feature_types" do
    field :key, :string
    field :label, :string
    field :unit_label, :string
    field :min, :decimal
    field :max, :decimal
    field :decimals, :integer, default: 1

    timestamps(type: :utc_datetime)
  end

  def changeset(type, attrs) do
    type
    |> cast(attrs, [:key, :label, :unit_label, :min, :max, :decimals])
    |> validate_required([:key, :label, :decimals])
    |> validate_number(:decimals, greater_than_or_equal_to: 0, less_than_or_equal_to: 4)
    |> unique_constraint(:key)
  end
end
