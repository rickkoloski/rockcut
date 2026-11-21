defmodule RockcutApi.Ingredients.ContractLine do
  @moduledoc """
  D61 §3.1: a contract's terms for one product (decision 39): a quantity at
  a price, in the unit `Catalog.contract_unit/1` gives the product's
  category (D62 §3.7): whole sacks at a price per sack for grain, lb (2
  decimals) at a price per lb for hops (A1). One line per product per
  contract.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "supplier_contract_lines" do
    field :quantity, :decimal
    field :price, :decimal
    # Contracted, on order, received and remaining (`Contracts`, A5).
    field :figures, :any, virtual: true

    belongs_to :contract, RockcutApi.Ingredients.Contract
    belongs_to :product, RockcutApi.Ingredients.Product
    # The supplier offer its price goes on (lead, Stop 2 note 3).
    belongs_to :offer, RockcutApi.Ingredients.SupplierOffer

    timestamps(type: :utc_datetime)
  end

  @doc "`unit` is the line's contract unit (`Catalog.contract_unit/1`): `:packs` or `:lb`."
  def changeset(line, attrs, unit \\ :packs) do
    line
    |> cast(attrs, [:contract_id, :product_id, :quantity, :price, :offer_id])
    |> validate_required([:contract_id, :product_id, :quantity, :price])
    |> validate_quantity(unit)
    |> validate_range(:price, 0, 100_000)
    |> validate_places(:price, 2)
    |> unique_constraint([:contract_id, :product_id],
      name: :supplier_contract_lines_contract_id_product_id_index,
      message: "This contract already has a line for that product"
    )
    |> foreign_key_constraint(:contract_id)
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:offer_id)
    |> RockcutApi.Changeset.validate_parents([:contract_id, :product_id, :offer_id])
  end

  # Whole sacks from 1; lb from 0.01, to 2 decimals.
  defp validate_quantity(changeset, :packs) do
    changeset
    |> validate_range(:quantity, 1, 100_000)
    |> validate_places(:quantity, 0)
  end

  defp validate_quantity(changeset, :lb) do
    changeset
    |> validate_positive_up_to(:quantity, 1_000_000)
    |> validate_places(:quantity, 2)
  end
end
