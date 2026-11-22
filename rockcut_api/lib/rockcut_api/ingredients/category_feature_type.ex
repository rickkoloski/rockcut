defmodule RockcutApi.Ingredients.CategoryFeatureType do
  @moduledoc """
  D60 §3.4: a feature that applies to a category (and its children), in
  `sort_order`, optionally required. D62 §3.4: where it lives there:
  `product_mode` (`none`; `value`, a standard; `range`, a typical low–high),
  `lot_mode` (`none`; `copy`, a new lot copies the standard; `enter`, typed
  for each lot), whether a lot must have it (`lot_required`), and
  `only_unit` (it applies only to products in that unit). D65: `only_form`
  (only to products in that form: Brix on Liquid sugars).
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "category_feature_types" do
    field :sort_order, :integer, default: 0
    field :required, :boolean, default: false
    field :product_mode, :string, default: "value"
    field :lot_mode, :string, default: "copy"
    field :lot_required, :boolean, default: false
    field :only_unit, :string
    field :only_form, :string

    belongs_to :category, RockcutApi.Brewing.IngredientCategory
    belongs_to :feature_type, RockcutApi.Ingredients.FeatureType

    timestamps(type: :utc_datetime)
  end

  def changeset(applicability, attrs) do
    applicability
    |> cast(attrs, [
      :category_id,
      :feature_type_id,
      :sort_order,
      :required,
      :product_mode,
      :lot_mode,
      :lot_required,
      :only_unit,
      :only_form
    ])
    |> validate_required([:category_id, :feature_type_id])
    |> validate_inclusion(:product_mode, ~w(none value range))
    |> validate_inclusion(:lot_mode, ~w(none copy enter))
    |> unique_constraint([:category_id, :feature_type_id])
    |> foreign_key_constraint(:category_id)
    |> foreign_key_constraint(:feature_type_id)
    |> RockcutApi.Changeset.validate_parents([:category_id, :feature_type_id])
  end
end
