defmodule RockcutApi.Brewing.IngredientCategory do
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredient_categories" do
    field :name, :string
    field :sort_order, :integer, default: 0

    has_many :field_definitions, RockcutApi.Brewing.CategoryFieldDefinition, foreign_key: :category_id
    has_many :ingredients, RockcutApi.Brewing.Ingredient, foreign_key: :category_id

    timestamps(type: :utc_datetime)
  end

  def changeset(category, attrs) do
    category
    |> cast(attrs, [:name, :sort_order])
    |> validate_required([:name])
    |> unique_constraint(:name)
  end
end
