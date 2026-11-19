defmodule RockcutApi.Ingredients.ContractLine do
  @moduledoc """
  D61 §3.1: a contract's terms for one maltster product (decision 39):
  whole sacks at a price per sack. One line per product per contract.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "supplier_contract_lines" do
    field :sacks, :integer
    field :price_per_sack, :decimal
    # Contracted, on order, received and remaining (`Contracts`, A5).
    field :figures, :any, virtual: true

    belongs_to :contract, RockcutApi.Ingredients.Contract
    belongs_to :product, RockcutApi.Ingredients.Product
    # The supplier offer its price goes on (lead, Stop 2 note 3).
    belongs_to :offer, RockcutApi.Ingredients.SupplierOffer

    timestamps(type: :utc_datetime)
  end

  def changeset(line, attrs) do
    line
    |> cast(attrs, [:contract_id, :product_id, :sacks, :price_per_sack, :offer_id])
    |> validate_required([:contract_id, :product_id, :sacks, :price_per_sack])
    |> validate_range(:sacks, 1, 100_000)
    |> validate_range(:price_per_sack, 0, 100_000)
    |> unique_constraint([:contract_id, :product_id],
      name: :supplier_contract_lines_contract_id_product_id_index,
      message: "This contract already has a line for that product"
    )
    |> foreign_key_constraint(:contract_id)
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:offer_id)
    |> RockcutApi.Changeset.validate_parents([:contract_id, :product_id, :offer_id])
  end
end
