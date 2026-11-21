defmodule RockcutApi.Brewing.IngredientLot do
  @moduledoc """
  A lot of an ingredient. D60: a grain lot is of a maltster product
  (`product`), from a supplier party, in packs (D62 §3.5: `pack_name` and
  `pack_size` in the product's unit, copied from the offer); its specs
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
    field :pack_name, :string, default: "sack"
    field :pack_size, :decimal
    field :notes, :string
    # D62 §3.4: a hop lot's crop year (required there, `Inventory`).
    field :crop_year, :integer
    # D62 §3.4: the feature keys whose value is outside the product's range
    # (`Features.put_outside_range/1`).
    field :outside_range, {:array, :string}, virtual: true, default: []
    # D60: the sum of its movements (in the product's unit), filled by
    # `Ingredients.Inventory.put_on_hand/1`.
    field :on_hand, :decimal, virtual: true
    # Why it can't be deleted, or nil (lead decisions 3, gap 15); filled with `on_hand`.
    field :delete_blocked, :string, virtual: true
    # D61 §3.4: cost per product unit (the latest costed receipt, else the
    # offer price, `estimated`), value of the on-hand, or `unvalued`
    # (`Ingredients.Valuation`).
    field :unit_cost, :decimal, virtual: true
    field :value, :decimal, virtual: true
    field :estimated, :boolean, virtual: true, default: false
    field :unvalued, :boolean, virtual: true, default: false

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
      :pack_name,
      :pack_size,
      :notes,
      :crop_year
    ])
    |> update_change(:lot_number, &trim_number/1)
    |> validate_required([:ingredient_id])
    |> validate_inclusion(:status, @valid_statuses)
    |> validate_inclusion(:pack_name, RockcutApi.Ingredients.Catalog.pack_names())
    |> validate_positive_up_to(:pack_size, 10_000)
    |> validate_crop_year()
    |> unique_lot_number()
    |> foreign_key_constraint(:ingredient_id)
    |> foreign_key_constraint(:product_id)
    |> foreign_key_constraint(:supplier_party_id)
    |> RockcutApi.Changeset.validate_parents([:ingredient_id, :product_id, :supplier_party_id])
  end

  # D62 §3.4: a four-digit year from 2000 through next year (Colorado).
  defp validate_crop_year(changeset) do
    last = RockcutApi.Tasks.today().year + 1

    validate_number(changeset, :crop_year,
      greater_than_or_equal_to: 2000,
      less_than_or_equal_to: last,
      message: "must be a year from 2000 to #{last}"
    )
  end

  # D61 lead (Stop 1 note 4): lot numbers are trimmed; blank is none.
  defp trim_number(number) when is_binary(number) do
    case String.trim(number) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp trim_number(number), do: number

  # D61 §3.3: a product's lot numbers are unique in any case (the index from
  # `20261118120003`); the same number is always the same lot. The context
  # checks first (`Inventory.find_lot/2`); this catches a race.
  defp unique_lot_number(changeset) do
    unique_constraint(changeset, :lot_number,
      name: :ingredient_lots_product_id_lot_number_index,
      message: "This product already has lot #{get_field(changeset, :lot_number)}",
      error_key: :base
    )
  end
end
