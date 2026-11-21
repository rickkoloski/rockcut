defmodule RockcutApi.Brewing.Ingredient do
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredients" do
    field :name, :string
    field :notes, :string
    # D65 (salts amendment): the chemical formula, "CaSO₄·2H₂O"; optional, any category.
    field :formula, :string
    # D65: its ion values (`Ingredients.Ions`), filled by the controller; nil when not.
    field :ions, :map, virtual: true

    belongs_to :category, RockcutApi.Brewing.IngredientCategory
    has_many :lots, RockcutApi.Brewing.IngredientLot
    has_many :products, RockcutApi.Ingredients.Product

    timestamps(type: :utc_datetime)
  end

  def changeset(ingredient, attrs) do
    ingredient
    |> cast(attrs, [:name, :category_id, :notes, :formula])
    |> update_change(:formula, &blank_to_nil/1)
    |> validate_required([:name, :category_id])
    |> validate_length(:formula, max: 40)
    |> unique_constraint([:name, :category_id])
    |> foreign_key_constraint(:category_id)
    |> RockcutApi.Changeset.validate_parents([:category_id])
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(text) do
    case String.trim(text) do
      "" -> nil
      trimmed -> trimmed
    end
  end
end
