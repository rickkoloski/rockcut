defmodule RockcutApi.Ingredients.SupplierOffer do
  @moduledoc """
  D60 §3.6: how a supplier sells a product (Silverston's Supplier Product):
  their catalog name, the pack (D62 §3.5: a name and a size in the
  product's unit, "sack · 55 lb" for grain), and for grain whether we order
  it milled or whole (one product and one stock either way, decision 9; nil
  on a hop offer).
  Prices are `OfferPrice` rows, newest effective first.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  @forms ~w(milled whole)

  schema "supplier_offers" do
    field :order_name, :string
    field :pack_name, :string, default: "sack"
    field :pack_size, :decimal
    field :form, :string, default: "whole"
    field :notes, :string
    field :active, :boolean, default: true
    # The latest price effective on or before today (`Offers.put_current_prices/1`).
    field :current_price, :any, virtual: true

    belongs_to :product, RockcutApi.Ingredients.Product
    belongs_to :supplier, RockcutApi.Ingredients.Party, foreign_key: :supplier_party_id
    has_many :prices, RockcutApi.Ingredients.OfferPrice, foreign_key: :offer_id

    timestamps(type: :utc_datetime)
  end

  def forms, do: @forms

  @doc """
  The offer's fields. D62 lead decisions 1, gap 3: `form` (milled/whole)
  is grain's alone, required there; `Offers` refuses it on any other
  category's offer and stores nil (`grain?` false).
  """
  def changeset(offer, attrs, grain? \\ true) do
    offer
    |> cast(attrs, [
      :product_id,
      :supplier_party_id,
      :order_name,
      :pack_name,
      :pack_size,
      :form,
      :notes,
      :active
    ])
    |> validate_required([:product_id, :supplier_party_id, :pack_name, :pack_size])
    |> then(&if(grain?, do: validate_required(&1, :form), else: &1))
    |> validate_inclusion(:form, @forms)
    |> validate_inclusion(:pack_name, RockcutApi.Ingredients.Catalog.pack_names())
    |> validate_positive_up_to(:pack_size, 10_000)
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:supplier_party_id)
    |> RockcutApi.Changeset.validate_parents([:product_id, :supplier_party_id])
  end
end
