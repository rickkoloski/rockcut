defmodule RockcutApi.Ingredients.PurchaseOrderLine do
  @moduledoc """
  D61 §3.2: a line on an order (Silverston's Order Item): whole packs of a
  supplier offer (D62 §3.5; sacks for grain) at a price per pack (default
  the offer's current price; $0.00 allowed). `packs_received` is set when
  the order is received and may differ from `packs_ordered` (decision 29;
  0 = nothing came).
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "purchase_order_lines" do
    field :packs_ordered, :integer
    field :price_per_pack, :decimal
    field :packs_received, :integer

    belongs_to :order, RockcutApi.Ingredients.PurchaseOrder
    belongs_to :offer, RockcutApi.Ingredients.SupplierOffer

    timestamps(type: :utc_datetime)
  end

  def changeset(line, attrs) do
    line
    |> cast(attrs, [:order_id, :offer_id, :packs_ordered, :price_per_pack, :packs_received])
    |> validate_required([:order_id, :offer_id, :packs_ordered, :price_per_pack])
    |> validate_range(:packs_ordered, 1, 100_000)
    |> validate_range(:packs_received, 0, 100_000)
    |> validate_range(:price_per_pack, 0, 100_000)
    |> validate_places(:price_per_pack, 2)
    |> foreign_key_constraint(:order_id)
    |> foreign_key_constraint(:offer_id)
    |> RockcutApi.Changeset.validate_parents([:order_id, :offer_id])
  end
end
