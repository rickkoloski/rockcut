defmodule RockcutApi.Brewing.RecipeIngredient do
  use Ecto.Schema
  import Ecto.Changeset

  schema "recipe_ingredients" do
    field :amount, :decimal
    field :unit, :string
    field :use, :string
    field :time_minutes, :integer
    field :sort_order, :integer, default: 0
    field :notes, :string

    belongs_to :recipe, RockcutApi.Brewing.Recipe
    belongs_to :lot, RockcutApi.Brewing.IngredientLot

    timestamps(type: :utc_datetime)
  end

  @valid_units ~w(lb oz g kg pkg each)
  @valid_uses ~w(mash steep boil whirlpool dry_hop flameout first_wort primary secondary)

  def changeset(recipe_ingredient, attrs) do
    recipe_ingredient
    |> cast(attrs, [:recipe_id, :lot_id, :amount, :unit, :use, :time_minutes, :sort_order, :notes])
    |> validate_required([:recipe_id, :lot_id, :amount, :unit])
    |> validate_inclusion(:unit, @valid_units)
    |> validate_inclusion(:use, @valid_uses)
    |> validate_number(:amount, greater_than: 0)
    |> foreign_key_constraint(:recipe_id)
    |> foreign_key_constraint(:lot_id)
  end
end
