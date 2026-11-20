defmodule RockcutApi.Brewing.IngredientCategory do
  use Ecto.Schema
  import Ecto.Changeset
  import Ecto.Query, only: [from: 2]

  schema "ingredient_categories" do
    field :name, :string
    # D62: a top-level category's stable key (`Ingredients.Catalog`); set by
    # migration and seeds, never from the API. Children have none.
    field :key, :string
    field :sort_order, :integer, default: 0
    # Why it can't be deleted, or nil (D61 carry-over 2; `Brewing.put_category_delete_blocked/1`).
    field :delete_blocked, :string, virtual: true

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
    |> cast(RockcutApi.Changeset.blank_to_nil(attrs, :sort_order), [
      :name,
      :sort_order,
      :parent_id
    ])
    |> validate_required([:name])
    |> unique_constraint(:name)
    |> foreign_key_constraint(:parent_id)
    |> RockcutApi.Changeset.validate_parents([:parent_id])
    |> validate_one_level()
  end

  # D60 §3.1: one level. A category isn't its own parent, its parent has no
  # parent, and a category with children doesn't get one.
  defp validate_one_level(changeset) do
    with {:ok, parent_id} when not is_nil(parent_id) <- fetch_change(changeset, :parent_id),
         false <- Keyword.has_key?(changeset.errors, :parent_id) do
      id = get_field(changeset, :id)
      parent = RockcutApi.Repo.get(__MODULE__, parent_id)

      cond do
        id && parent_id == id ->
          add_error(changeset, :parent_id, "can't be the category itself")

        parent && parent.parent_id ->
          add_error(changeset, :parent_id, "is a subcategory; pick a top-level category")

        id && RockcutApi.Repo.exists?(from(c in __MODULE__, where: c.parent_id == ^id)) ->
          add_error(
            changeset,
            :parent_id,
            "This category has subcategories, so it stays top-level"
          )

        true ->
          changeset
      end
    else
      _ -> changeset
    end
  end
end
