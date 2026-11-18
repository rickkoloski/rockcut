defmodule RockcutApi.Ingredients.SupplierOffer do
  @moduledoc """
  D60 §3.6: how a supplier sells a maltster product (Silverston's Supplier
  Product): their catalog name, the sack size in lb, and whether we order it
  milled or whole (one product and one stock either way, decision 9).
  Prices are `OfferPrice` rows, newest effective first.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  @forms ~w(milled whole)

  schema "supplier_offers" do
    field :order_name, :string
    field :sack_size_lb, :decimal
    field :form, :string, default: "whole"
    field :notes, :string
    field :active, :boolean, default: true

    belongs_to :product, RockcutApi.Ingredients.Product
    belongs_to :supplier, RockcutApi.Ingredients.Party, foreign_key: :supplier_party_id
    has_many :prices, RockcutApi.Ingredients.OfferPrice, foreign_key: :offer_id

    timestamps(type: :utc_datetime)
  end

  def forms, do: @forms

  def changeset(offer, attrs) do
    offer
    |> cast(attrs, [
      :product_id,
      :supplier_party_id,
      :order_name,
      :sack_size_lb,
      :form,
      :notes,
      :active
    ])
    |> validate_required([:product_id, :supplier_party_id, :sack_size_lb, :form])
    |> validate_inclusion(:form, @forms)
    |> validate_positive_up_to(:sack_size_lb, 10_000)
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:supplier_party_id)
    |> RockcutApi.Changeset.validate_parents([:product_id, :supplier_party_id])
  end
end
