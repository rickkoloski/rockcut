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
    |> validate_no_custom_fields()
  end

  # D61 carry-over 5: grains have features (D60 §3.4), not custom fields, so
  # Grains and its children take none. D62 (split Amendment): nor does Hops
  # (form and origin are on the product, crop year and alpha on the lot).
  # D65 §4.1: nor do Fruits, Spices & Flavorings and Sugars and Extracts
  # (their form is on the product).
  defp validate_no_custom_fields(changeset) do
    with {:ok, id} when not is_nil(id) <- fetch_change(changeset, :category_id),
         false <- Keyword.has_key?(changeset.errors, :category_id),
         key = RockcutApi.Ingredients.Catalog.key(id),
         false <- RockcutApi.Ingredients.Catalog.allows_fields?(key) do
      add_error(changeset, :category_id, refusal(key, id))
    else
      _ -> changeset
    end
  end

  defp refusal("grains", _id), do: "Grains use features, not custom fields"
  defp refusal("hops", _id), do: "Hops use features, not custom fields"

  # The category's own name ("Fruits use products, not custom fields").
  defp refusal(_key, id) do
    top =
      case RockcutApi.Repo.get(RockcutApi.Brewing.IngredientCategory, id) do
        %{parent_id: nil, name: name} ->
          name

        %{parent_id: parent} ->
          RockcutApi.Repo.get!(RockcutApi.Brewing.IngredientCategory, parent).name
      end

    "#{top} use products, not custom fields"
  end
end
