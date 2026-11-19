defmodule RockcutApi.Brewing.IngredientLot do
  @moduledoc """
  A lot of an ingredient. D60: a grain lot is of a maltster product
  (`product`), from a supplier party, in sacks of `sack_size_lb`; its specs
  are `feature_values` (copied from the product's standard) and its stock is
  the sum of its `movements`.
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "ingredient_lots" do
    field :lot_number, :string
    field :received_date, :date
    field :status, :string, default: "available"
    field :sack_size_lb, :decimal
    field :notes, :string
    # D60: the sum of its movements, filled by `Ingredients.Inventory.put_on_hand/1`.
    field :on_hand_lb, :decimal, virtual: true
    # Why it can't be deleted, or nil (lead decisions 3, gap 15); filled with `on_hand_lb`.
    field :delete_blocked, :string, virtual: true

    belongs_to :ingredient, RockcutApi.Brewing.Ingredient
    belongs_to :product, RockcutApi.Ingredients.Product
    belongs_to :supplier, RockcutApi.Ingredients.Party, foreign_key: :supplier_party_id
    has_many :feature_values, RockcutApi.Ingredients.LotFeatureValue, foreign_key: :lot_id
    has_many :movements, RockcutApi.Ingredients.Movement, foreign_key: :lot_id

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(available depleted expired)

  def changeset(lot, attrs) do
    lot
    |> cast(attrs, [
      :ingredient_id,
      :product_id,
      :supplier_party_id,
      :lot_number,
      :received_date,
      :status,
      :sack_size_lb,
      :notes
    ])
    |> validate_required([:ingredient_id])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_positive_up_to(:sack_size_lb, 10_000)
    |> unique_lot_number()
    |> foreign_key_constraint(:ingredient_id)
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:supplier_party_id)
    |> RockcutApi.Changeset.validate_parents([:ingredient_id, :product_id, :supplier_party_id])
  end

  # D61 §3.3: a product's lot numbers are unique (the index from
  # `20261118120002`); the same number is always the same lot.
  defp unique_lot_number(changeset) do
    unique_constraint(changeset, :lot_number,
      name: :ingredient_lots_product_id_lot_number_index,
      message: "This product already has lot #{get_field(changeset, :lot_number)}"
    )
  end
end
