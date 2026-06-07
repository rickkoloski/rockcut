defmodule RockcutApi.Brewing.IngredientLot do
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredient_lots" do
    field :lot_number, :string
    field :supplier, :string
    field :received_date, :date
    field :status, :string, default: "available"

    # Shared calc fields
    field :alpha_acid, :decimal
    field :color_lovibond, :decimal
    field :attenuation, :decimal

    # Grain-specific fields
    field :extract_potential_fgdb, :decimal
    field :maltster, :string
    field :protein_perc, :decimal
    field :moisture_perc, :decimal
    field :order_name, :string
    field :order_unit_size, :string

    # Dynamic fields as JSON (reserved for future use)
    field :properties, :string
    field :notes, :string

    belongs_to :ingredient, RockcutApi.Brewing.Ingredient

    timestamps(type: :utc_datetime)
  end

  @valid_statuses ~w(available depleted expired)

  def changeset(lot, attrs) do
    lot
    |> cast(attrs, [
      :ingredient_id, :lot_number, :supplier, :received_date, :status,
      :alpha_acid, :color_lovibond, :attenuation,
      :extract_potential_fgdb, :maltster, :protein_perc, :moisture_perc,
      :order_name, :order_unit_size,
      :properties, :notes
    ])
    |> validate_required([:ingredient_id])
    |> validate_inclusion(:status, @valid_statuses)
    |> foreign_key_constraint(:ingredient_id)
  end
end
