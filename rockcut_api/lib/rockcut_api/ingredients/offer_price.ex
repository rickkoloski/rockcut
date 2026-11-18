defmodule RockcutApi.Ingredients.OfferPrice do
  @moduledoc """
  D60 §3.6: a supplier offer's price per sack from `effective_on`. A price
  change adds a row; the current price is the latest effective on or before
  today.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "supplier_offer_prices" do
    field :price_per_sack, :decimal
    field :effective_on, :date
    field :note, :string

    belongs_to :offer, RockcutApi.Ingredients.SupplierOffer
    belongs_to :entered_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(price, attrs) do
    price
    |> cast(attrs, [:offer_id, :price_per_sack, :effective_on, :note, :entered_by_id])
    |> validate_required([:offer_id, :price_per_sack, :effective_on])
    |> validate_range(:price_per_sack, 0, 100_000)
    |> foreign_key_constraint(:offer_id)
    |> RockcutApi.Changeset.validate_parents([:offer_id, :entered_by_id])
  end
end
