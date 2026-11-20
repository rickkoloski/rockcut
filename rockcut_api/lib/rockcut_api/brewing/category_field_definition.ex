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
    |> cast(RockcutApi.Changeset.blank_to_nil(attrs, :sort_order), [
      :category_id,
      :field_name,
      :field_type,
      :options,
      :required,
      :sort_order
    ])
    |> validate_required([:category_id, :field_name, :field_type])
    |> validate_inclusion(:field_type, @valid_field_types)
    |> unique_constraint([:category_id, :field_name])
    |> foreign_key_constraint(:category_id)
    |> RockcutApi.Changeset.validate_parents([:category_id])
    |> validate_not_grains()
  end

  # D61 carry-over 5: grains have features (D60 §3.4), not custom fields, so
  # Grains and its children take none.
  defp validate_not_grains(changeset) do
    with {:ok, id} when not is_nil(id) <- fetch_change(changeset, :category_id),
         false <- Keyword.has_key?(changeset.errors, :category_id),
         true <- grains?(id) do
      add_error(changeset, :category_id, "Grains use features, not custom fields")
    else
      _ -> changeset
    end
  end

  defp grains?(id), do: RockcutApi.Ingredients.Catalog.key(id) == "grains"
end
