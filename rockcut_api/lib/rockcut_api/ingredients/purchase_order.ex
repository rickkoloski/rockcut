defmodule RockcutApi.Ingredients.PurchaseOrder do
  @moduledoc """
  D61 §3.2: an order to a supplier (Silverston's Order), placed when it's
  saved (decision 42, no draft). `open` until it's received (all lines at
  once, decision 44) or cancelled; then read-only. An off-contract order
  doesn't count against a contract (decision 28).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(open received cancelled)

  schema "purchase_orders" do
    field :ordered_on, :date
    field :expected_on, :date
    field :reference, :string
    field :off_contract, :boolean, default: false
    field :notes, :string
    field :status, :string, default: "open"
    field :received_on, :date
    field :received_at, :utc_datetime
    field :cancelled_at, :utc_datetime
    # Lead decisions 2 (gap 1): bumped by every write; Edit sends it back.
    field :lock_version, :integer, default: 1

    belongs_to :supplier, RockcutApi.Ingredients.Party, foreign_key: :supplier_party_id
    belongs_to :created_by, RockcutApi.Accounts.User
    belongs_to :received_by, RockcutApi.Accounts.User
    belongs_to :cancelled_by, RockcutApi.Accounts.User
    has_many :lines, RockcutApi.Ingredients.PurchaseOrderLine, foreign_key: :order_id

    timestamps(type: :utc_datetime)
  end

  def statuses, do: @statuses

  def changeset(order, attrs) do
    order
    |> cast(attrs, [
      :supplier_party_id,
      :ordered_on,
      :expected_on,
      :reference,
      :off_contract,
      :notes,
      :status,
      :received_on,
      :created_by_id,
      :received_by_id,
      :cancelled_by_id,
      :received_at,
      :cancelled_at
    ])
    |> update_change(:reference, &blank_to_nil/1)
    |> validate_required([:supplier_party_id, :ordered_on, :status])
    |> validate_inclusion(:status, @statuses)
    |> validate_length(:reference, max: 100)
    |> foreign_key_constraint(:supplier_party_id)
    |> RockcutApi.Changeset.validate_parents([
      :supplier_party_id,
      :created_by_id,
      :received_by_id,
      :cancelled_by_id
    ])
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(reference) do
    case String.trim(reference) do
      "" -> nil
      trimmed -> trimmed
    end
  end
end
