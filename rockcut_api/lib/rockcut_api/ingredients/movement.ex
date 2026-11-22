defmodule RockcutApi.Ingredients.Movement do
  @moduledoc """
  D60 §3.7: stock into or out of a lot, signed, in the product's unit (D62
  §3.5; lb for grain). A lot's on hand is the
  sum of its movements. Movements aren't edited: a wrong one is undone by an
  opposite movement or a count. Signs, partner breweries for trades and
  loans, and the below-zero refusal are the context's rules.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  @kinds ~w(opening received used traded_out traded_in loaned_out loaned_in count)

  schema "inventory_movements" do
    field :kind, :string
    field :quantity, :decimal
    field :occurred_on, :date
    field :note, :string
    # D61 §3.4: a Received movement from an order carries its cost per unit.
    field :unit_cost, :decimal

    belongs_to :lot, RockcutApi.Brewing.IngredientLot
    belongs_to :partner, RockcutApi.Ingredients.Party, foreign_key: :partner_party_id
    belongs_to :entered_by, RockcutApi.Accounts.User
    belongs_to :purchase_order_line, RockcutApi.Ingredients.PurchaseOrderLine
    # D64 §4.6: the batch a pitch of purchased yeast went into (D63: every brew-day draw).
    belongs_to :batch, RockcutApi.Brewing.Batch

    timestamps(type: :utc_datetime)
  end

  def kinds, do: @kinds

  def changeset(movement, attrs) do
    movement
    |> cast(attrs, [
      :lot_id,
      :kind,
      :quantity,
      :occurred_on,
      :partner_party_id,
      :note,
      :entered_by_id,
      :purchase_order_line_id,
      :unit_cost,
      :batch_id
    ])
    |> validate_required([:lot_id, :kind, :quantity, :occurred_on])
    |> validate_inclusion(:kind, @kinds)
    |> validate_range(:quantity, -1_000_000, 1_000_000)
    |> validate_range(:unit_cost, 0, 100_000)
    |> foreign_key_constraint(:lot_id)
    |> foreign_key_constraint(:partner_party_id)
    |> foreign_key_constraint(:purchase_order_line_id)
    |> foreign_key_constraint(:batch_id)
    |> RockcutApi.Changeset.validate_parents([
      :lot_id,
      :partner_party_id,
      :entered_by_id,
      :purchase_order_line_id,
      :batch_id
    ])
  end
end
