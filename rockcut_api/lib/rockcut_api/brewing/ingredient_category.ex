defmodule RockcutApi.Brewing.IngredientCategory do
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredient_categories" do
    field :name, :string
    field :sort_order, :integer, default: 0

    # D60 §3.1: Grains' five children (Base, Crystal/Caramel, ...). A parent
    # includes its children in the lists and filters.
    belongs_to :parent, __MODULE__
    has_many :children, __MODULE__, foreign_key: :parent_id

    has_many :field_definitions, RockcutApi.Brewing.CategoryFieldDefinition,
      foreign_key: :category_id

    has_many :ingredients, RockcutApi.Brewing.Ingredient, foreign_key: :category_id

    timestamps(type: :utc_datetime)
  end

  def changeset(category, attrs) do
    category
    |> cast(RockcutApi.Changeset.blank_to_nil(attrs, :sort_order), [:name, :sort_order])
    |> validate_required([:name])
    |> unique_constraint(:name)
  end
end
