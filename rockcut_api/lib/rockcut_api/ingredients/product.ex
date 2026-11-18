defmodule RockcutApi.Ingredients.Product do
  @moduledoc """
  D60 §3.3: a maltster product ("Rahr 2-Row", "Weyermann Rauch Malt"): a
  grain (`ingredient`) from one maltster, with an optional product name of
  the maltster's own. Its feature values are the standard specs a new lot
  copies (decision 7).
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredient_products" do
    field :name, :string
    field :notes, :string
    field :active, :boolean, default: true
    # The sum of its lots' movements (`Ingredients.Products`).
    field :on_hand_lb, :decimal, virtual: true
    # The part of it in expired lots.
    field :expired_lb, :decimal, virtual: true

    belongs_to :ingredient, RockcutApi.Brewing.Ingredient
    belongs_to :maltster, RockcutApi.Ingredients.Party, foreign_key: :maltster_party_id
    has_many :feature_values, RockcutApi.Ingredients.ProductFeatureValue
    has_many :offers, RockcutApi.Ingredients.SupplierOffer
    has_many :lots, RockcutApi.Brewing.IngredientLot

    timestamps(type: :utc_datetime)
  end

  def changeset(product, attrs) do
    product
    |> cast(attrs, [:ingredient_id, :maltster_party_id, :name, :notes, :active])
    |> update_change(:name, &blank_to_nil/1)
    |> validate_required([:ingredient_id, :maltster_party_id])
    |> validate_length(:name, max: 100)
    |> unique_constraint([:ingredient_id, :maltster_party_id, :name],
      name: :ingredient_products_ingredient_maltster_name_index,
      message: "This maltster already has that product for this grain."
    )
    |> foreign_key_constraint(:ingredient_id)
    |> foreign_key_constraint(:maltster_party_id)
    |> RockcutApi.Changeset.validate_parents([:ingredient_id, :maltster_party_id])
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(name) do
    case String.trim(name) do
      "" -> nil
      trimmed -> trimmed
    end
  end
end
