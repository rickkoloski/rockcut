defmodule RockcutApi.Ingredients.PurchaseOrderLine do
  @moduledoc """
  D61 §3.2: a line on an order (Silverston's Order Item): whole sacks of a
  supplier offer at a price per sack (default the offer's current price;
  $0.00 allowed). `sacks_received` is set when the order is received and may
  differ from `sacks_ordered` (decision 29; 0 = nothing came).
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "purchase_order_lines" do
    field :sacks_ordered, :integer
    field :price_per_sack, :decimal
    field :sacks_received, :integer

    belongs_to :order, RockcutApi.Ingredients.PurchaseOrder
    belongs_to :offer, RockcutApi.Ingredients.SupplierOffer

    timestamps(type: :utc_datetime)
  end

  def changeset(line, attrs) do
    line
    |> cast(attrs, [:order_id, :offer_id, :sacks_ordered, :price_per_sack, :sacks_received])
    |> validate_required([:order_id, :offer_id, :sacks_ordered, :price_per_sack])
    |> validate_range(:sacks_ordered, 1, 100_000)
    |> validate_range(:sacks_received, 0, 100_000)
    |> validate_range(:price_per_sack, 0, 100_000)
    |> foreign_key_constraint(:order_id)
    |> foreign_key_constraint(:offer_id)
    |> RockcutApi.Changeset.validate_parents([:order_id, :offer_id])
  end
end
