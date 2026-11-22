defmodule RockcutApi.Brewing.Ingredient do
  use Ecto.Schema
  import Ecto.Changeset

  schema "ingredients" do
    field :name, :string
    field :notes, :string
    # D65 (salts amendment): the chemical formula, "CaSO₄·2H₂O"; optional, on
    # Water Salts ingredients only (lead decisions 3, gap 1).
    field :formula, :string
    # D65: its ion values (`Ingredients.Ions`), filled by the controller; nil when not.
    field :ions, :map, virtual: true

    # Why it can't be deleted, or nil (D65 lead decisions 1, gap 13; `Brewing.put_ingredient_delete_blocked/1`).
    field :delete_blocked, :string, virtual: true

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
    |> validate_formula_category()
    |> unique_constraint([:name, :category_id])
    |> foreign_key_constraint(:category_id)
    |> RockcutApi.Changeset.validate_parents([:category_id])
  end

  # D65 lead decisions 3 (gap 1): a formula is set only on a Water Salts
  # ingredient. One stored before (any category) is kept while it isn't
  # changed, and clearing it is allowed.
  defp validate_formula_category(changeset) do
    with formula when is_binary(formula) <- get_change(changeset, :formula),
         category_id when is_integer(category_id) <- get_field(changeset, :category_id),
         %RockcutApi.Brewing.IngredientCategory{} = category <-
           RockcutApi.Repo.get(RockcutApi.Brewing.IngredientCategory, category_id),
         false <- RockcutApi.Ingredients.Catalog.water_salts?(category) do
      add_error(changeset, :formula, "is only for Water Salts ingredients")
    else
      _ -> changeset
    end
  end

  defp blank_to_nil(nil), do: nil

  defp blank_to_nil(text) do
    case String.trim(text) do
      "" -> nil
      trimmed -> trimmed
    end
  end
end
