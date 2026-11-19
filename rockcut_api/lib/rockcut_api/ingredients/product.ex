defmodule RockcutApi.Ingredients.Product do
  @moduledoc """
  D60 §3.3: a maltster product ("Rahr 2-Row", "Weyermann Rauch Malt"): a
  grain (`ingredient`) from one maltster, with an optional product name of
  the maltster's own. Its feature values are the standard specs a new lot
  copies (decision 7).
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "ingredient_products" do
    field :name, :string
    field :notes, :string
    field :active, :boolean, default: true
    # D61 §3.5: the reorder point in whole sacks (nil = no minimum).
    field :min_on_hand_sacks, :integer
    # The sum of its lots' movements (`Ingredients.Products`).
    field :on_hand_lb, :decimal, virtual: true
    # The part of it in expired lots.
    field :expired_lb, :decimal, virtual: true
    # D61 §3.5: on hand (not expired) under the minimum (`Ingredients.Reorder`).
    field :below_minimum, :boolean, virtual: true, default: false

    belongs_to :ingredient, RockcutApi.Brewing.Ingredient
    belongs_to :maltster, RockcutApi.Ingredients.Party, foreign_key: :maltster_party_id
    # D61 lead decisions 1 (gap 4): the offer To order uses (nil = default).
    belongs_to :reorder_offer, RockcutApi.Ingredients.SupplierOffer
    has_many :feature_values, RockcutApi.Ingredients.ProductFeatureValue
    has_many :offers, RockcutApi.Ingredients.SupplierOffer
    has_many :lots, RockcutApi.Brewing.IngredientLot

    timestamps(type: :utc_datetime)
  end

  def changeset(product, attrs) do
    product
    |> cast(attrs, [
      :ingredient_id,
      :maltster_party_id,
      :name,
      :notes,
      :active,
      :min_on_hand_sacks,
      :reorder_offer_id
    ])
    |> update_change(:name, &blank_to_nil/1)
    |> validate_required([:ingredient_id, :maltster_party_id])
    |> validate_length(:name, max: 100)
    |> validate_range(:min_on_hand_sacks, 0, 100_000)
    |> unique_constraint([:ingredient_id, :maltster_party_id, :name],
      name: :ingredient_products_ingredient_maltster_name_index,
      message: "This maltster already has that product for this grain."
    )
    |> foreign_key_constraint(:ingredient_id)
    |> foreign_key_constraint(:maltster_party_id)
    |> foreign_key_constraint(:reorder_offer_id)
    |> validate_reorder_offer()
    |> RockcutApi.Changeset.validate_parents([
      :ingredient_id,
      :maltster_party_id,
      :reorder_offer_id
    ])
  end

  # Gap 4: one of this product's active offers (one that doesn't exist is
  # `validate_parents`' "does not exist").
  defp validate_reorder_offer(changeset) do
    validate_change(changeset, :reorder_offer_id, fn _, id ->
      case RockcutApi.Repo.get(RockcutApi.Ingredients.SupplierOffer, id) do
        nil -> []
        %{product_id: pid, active: true} when pid == changeset.data.id -> []
        _ -> [reorder_offer_id: "must be one of this product's active offers"]
      end
    end)
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(name) do
    case String.trim(name) do
      "" -> nil
      trimmed -> trimmed
    end
  end
end
