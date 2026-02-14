defmodule RockcutApi.Brewing.Ingredient do
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredients" do
    field :name, :string
    field :notes, :string

    belongs_to :category, RockcutApi.Brewing.IngredientCategory
    has_many :lots, RockcutApi.Brewing.IngredientLot

    timestamps(type: :utc_datetime)
  end

  def changeset(ingredient, attrs) do
    ingredient
    |> cast(attrs, [:name, :category_id, :notes])
    |> validate_required([:name, :category_id])
    |> unique_constraint([:name, :category_id])
    |> foreign_key_constraint(:category_id)
  end
end
