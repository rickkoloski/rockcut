defmodule RockcutApi.Brewing.IngredientLot do
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredient_lots" do
    field :lot_number, :string
    field :supplier, :string
    field :received_date, :date
    field :status, :string, default: "available"

    # Calc fields for recipe math
    field :alpha_acid, :decimal
    field :color_lovibond, :decimal
    field :potential_gravity, :decimal
    field :attenuation, :decimal

    # Dynamic fields as JSON
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
      :alpha_acid, :color_lovibond, :potential_gravity, :attenuation,
      :properties, :notes
    ])
    |> validate_required([:ingredient_id])
    |> validate_inclusion(:status, @valid_statuses)
    |> foreign_key_constraint(:ingredient_id)
  end
end
