defmodule RockcutApi.Ingredients.Product do
  @moduledoc """
  D60 §3.3: a product ("Rahr 2-Row", "Weyermann Rauch Malt"): an
  ingredient from one manufacturer (D62 §3.2; the maltster, for grain),
  with an optional product name of the manufacturer's own. D62 §3.3: it's
  kept in one `unit` (lb for grain), and may have a `form` and an `origin`
  (not used for grain). Its feature values are the standard specs a new
  lot copies (decision 7).
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "ingredient_products" do
    field :name, :string
    field :notes, :string
    field :active, :boolean, default: true
    field :unit, :string, default: "lb"
    field :form, :string
    field :origin, :string
    # D61 §3.5: the reorder point in whole packs (nil = no minimum).
    field :min_on_hand_packs, :integer
    # D62 lead decisions 1, gap 9: bumped on every save (`Versions`).
    field :lock_version, :integer, default: 1
    # The sum of its lots' movements, in `unit` (`Ingredients.Products`).
    field :on_hand, :decimal, virtual: true
    # The part of it in expired lots.
    field :expired, :decimal, virtual: true
    # D61 §3.5: on hand (not expired) under the minimum (`Ingredients.Reorder`).
    field :below_minimum, :boolean, virtual: true, default: false

    belongs_to :ingredient, RockcutApi.Brewing.Ingredient
    belongs_to :manufacturer, RockcutApi.Ingredients.Party, foreign_key: :manufacturer_party_id
    # D61 lead decisions 1 (gap 4): the offer To order uses (nil = default).
    belongs_to :reorder_offer, RockcutApi.Ingredients.SupplierOffer
    has_many :feature_values, RockcutApi.Ingredients.ProductFeatureValue
    has_many :offers, RockcutApi.Ingredients.SupplierOffer
    has_many :lots, RockcutApi.Brewing.IngredientLot

    timestamps(type: :utc_datetime)
  end

  @doc """
  The product's fields. `Products` decides `form` and `unit` by the
  category (`Ingredients.Catalog`); `key` is that category's key, for the
  duplicate's wording.
  """
  def changeset(product, attrs, key \\ "grains") do
    product
    |> cast(attrs, [
      :ingredient_id,
      :manufacturer_party_id,
      :name,
      :notes,
      :active,
      :form,
      :unit,
      :origin,
      :min_on_hand_packs,
      :reorder_offer_id
    ])
    |> update_change(:name, &blank_to_nil/1)
    |> update_change(:origin, &blank_to_nil/1)
    |> validate_required([:ingredient_id, :manufacturer_party_id, :unit])
    |> validate_length(:name, max: 100)
    |> validate_length(:origin, max: 100)
    |> validate_range(:min_on_hand_packs, 0, 100_000)
    |> unique_product(key)
    |> foreign_key_constraint(:ingredient_id)
    |> foreign_key_constraint(:manufacturer_party_id)
    |> foreign_key_constraint(:reorder_offer_id)
    |> validate_reorder_offer()
    |> RockcutApi.Changeset.validate_parents([
      :ingredient_id,
      :manufacturer_party_id,
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

  # Stage 4 (lead): grain keeps D60's sentence; every other category names
  # them, "Yakima Chief Hops already has T90 Pellet Citra."
  # D62 lead decisions 1, gap 1: under `base`, so the dialog shows the
  # sentence alone, not "ingredient id: …".
  defp unique_product(changeset, key) do
    unique_constraint(changeset, [:ingredient_id, :manufacturer_party_id, :name],
      name: :ingredient_products_ingredient_manufacturer_form_name_index,
      error_key: :base,
      message: duplicate(changeset, key)
    )
  end

  defp duplicate(_changeset, "grains"),
    do: "This maltster already has that product for this grain."

  defp duplicate(changeset, _key) do
    manufacturer = name_of(RockcutApi.Ingredients.Party, changeset, :manufacturer_party_id)
    ingredient = name_of(RockcutApi.Brewing.Ingredient, changeset, :ingredient_id)

    if manufacturer && ingredient do
      what = Enum.join(Enum.reject([get_field(changeset, :form), ingredient], &is_nil/1), " ")

      what =
        case get_field(changeset, :name) do
          nil -> what
          name -> "#{what} (#{name})"
        end

      "#{manufacturer} already has #{what}."
    else
      "This manufacturer already has that product."
    end
  end

  # nil for a blank or missing id (`validate_parents` says which).
  defp name_of(schema, changeset, field) do
    with id when is_integer(id) <- get_field(changeset, field),
         %{name: name} <- RockcutApi.Repo.get(schema, id) do
      name
    else
      _ -> nil
    end
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(name) do
    case String.trim(name) do
      "" -> nil
      trimmed -> trimmed
    end
  end
end
