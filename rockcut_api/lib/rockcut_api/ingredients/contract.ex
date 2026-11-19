defmodule RockcutApi.Ingredients.Contract do
  @moduledoc """
  D61 §3.1: a malt contract (Silverston's Agreement) with one supplier for
  one calendar year (A1: one per supplier per year). Its lines are sacks of
  a maltster product at a price per sack. What's on order, received and
  remaining is computed on read (`Contracts`).
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "supplier_contracts" do
    field :year, :integer
    field :notes, :string
    # Computed on read (`Contracts`, lead decisions 1 gaps 3 and 18).
    field :remaining_sacks, :any, virtual: true
    field :over_sacks, :any, virtual: true
    field :delete_blocked, :boolean, virtual: true, default: false

    belongs_to :supplier, RockcutApi.Ingredients.Party, foreign_key: :supplier_party_id
    belongs_to :created_by, RockcutApi.Accounts.User
    has_many :lines, RockcutApi.Ingredients.ContractLine

    timestamps(type: :utc_datetime)
  end

  def changeset(contract, attrs) do
    contract
    |> cast(attrs, [:supplier_party_id, :year, :notes, :created_by_id])
    |> validate_required([:supplier_party_id, :year])
    |> validate_number(:year,
      greater_than_or_equal_to: 2000,
      less_than_or_equal_to: 2100,
      message: "must be between 2000 and 2100"
    )
    |> unique_constraint([:supplier_party_id, :year],
      name: :supplier_contracts_supplier_party_id_year_index,
      message: "This supplier already has a contract for that year"
    )
    |> foreign_key_constraint(:supplier_party_id)
    |> RockcutApi.Changeset.validate_parents([:supplier_party_id, :created_by_id])
  end
end
