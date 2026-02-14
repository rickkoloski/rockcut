defmodule RockcutApi.Brewing.CategoryFieldDefinition do
  use Ecto.Schema
  import Ecto.Changeset

  schema "category_field_definitions" do
    field :field_name, :string
    field :field_type, :string
    field :options, :string
    field :required, :boolean, default: false
    field :sort_order, :integer, default: 0

    belongs_to :category, RockcutApi.Brewing.IngredientCategory

    timestamps(type: :utc_datetime)
  end

  @valid_field_types ~w(text number dropdown checkbox)

  def changeset(definition, attrs) do
    definition
    |> cast(attrs, [:category_id, :field_name, :field_type, :options, :required, :sort_order])
    |> validate_required([:category_id, :field_name, :field_type])
    |> validate_inclusion(:field_type, @valid_field_types)
    |> unique_constraint([:category_id, :field_name])
    |> foreign_key_constraint(:category_id)
  end
end
