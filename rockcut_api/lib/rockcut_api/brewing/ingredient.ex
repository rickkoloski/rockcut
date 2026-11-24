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
    # D64 (Amendment 2, A13): a yeast strain's type (Ale, Lager, Brett, Lacto); yeast only.
    belongs_to :yeast_strain_type, RockcutApi.Yeast.StrainType
    has_many :lots, RockcutApi.Brewing.IngredientLot
    has_many :products, RockcutApi.Ingredients.Product

    timestamps(type: :utc_datetime)
  end

  def changeset(ingredient, attrs) do
    ingredient
    |> cast(attrs, [:name, :category_id, :notes, :formula, :yeast_strain_type_id])
    |> update_change(:formula, &blank_to_nil/1)
    |> validate_required([:name, :category_id])
    |> validate_length(:formula, max: 40)
    |> validate_formula_category()
    |> validate_strain_type()
    |> unique_constraint([:name, :category_id])
    |> foreign_key_constraint(:category_id)
    |> foreign_key_constraint(:yeast_strain_type_id)
    |> RockcutApi.Changeset.validate_parents([:category_id, :yeast_strain_type_id])
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

  # D64 (A13): a strain type is set only on a Yeast Strains ingredient, and a
  # new pick is an active type (one retired stays on the strains that have it).
  defp validate_strain_type(changeset) do
    with {:ok, id} when not is_nil(id) <- fetch_change(changeset, :yeast_strain_type_id),
         category_id when is_integer(category_id) <- get_field(changeset, :category_id) do
      cond do
        RockcutApi.Ingredients.Catalog.key(category_id) != "yeast" ->
          add_error(changeset, :yeast_strain_type_id, "is only for yeast strains")

        true ->
          case RockcutApi.Yeast.StrainTypes.check_pick(id, changeset.data.yeast_strain_type_id) do
            :ok ->
              changeset

            {:error, {:invalid, %{yeast_strain_type_id: [message]}}} ->
              add_error(changeset, :yeast_strain_type_id, message)
          end
      end
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
