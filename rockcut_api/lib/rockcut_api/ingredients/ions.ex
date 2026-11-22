defmodule RockcutApi.Ingredients.Ions do
  @moduledoc """
  D65 (salts amendment, decision 1): the ppm each ion reaches from 1 g of a
  water salt in 1 gal, stored once per ingredient (`ingredient_feature_values`)
  and shown read-only on its products. Only a Water Salts ingredient has
  them (`Catalog.water_salts?/1`); each value has 1 decimal and lies in
  0–1000 (the feature types' own rules). Lots carry none; D63's water
  chemistry reads them.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory}
  alias RockcutApi.Ingredients.{Catalog, FeatureType, Features, IngredientFeatureValue}

  @keys ~w(ca mg co3 hco3 so4 na cl) |> Enum.map(&"#{&1}_ppm_per_g_gal")

  @doc "The seven ion feature keys, in the order screens show them (Ca, Mg, CO₃, HCO₃, SO₄, Na, Cl)."
  def keys, do: @keys

  @doc "Ion values by ingredient id: `%{ingredient_id => %{key => value}}` (one query)."
  def by_ingredient([]), do: %{}

  def by_ingredient(ingredient_ids) do
    from(v in IngredientFeatureValue,
      join: t in assoc(v, :feature_type),
      where: v.ingredient_id in ^Enum.uniq(ingredient_ids),
      select: {v.ingredient_id, t.key, v.value}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, key, value}, acc ->
      Map.update(acc, id, %{key => value}, &Map.put(&1, key, value))
    end)
  end

  @doc "One ingredient's ion values, `%{key => value}`."
  def get(ingredient_id), do: Map.get(by_ingredient([ingredient_id]), ingredient_id, %{})

  @doc """
  Set an ingredient's ions from `%{key => value}` (nil or "" clears one; a
  key left out is kept). 422 for an ingredient outside Water Salts, a key
  that isn't an ion, or a value outside its type's rules.
  """
  def put(%Ingredient{} = ingredient, ions) when is_map(ions) do
    category = Repo.get(IngredientCategory, ingredient.category_id)
    types = Map.new(Repo.all(from(t in FeatureType, where: t.key in ^@keys)), &{&1.key, &1})

    cond do
      not Catalog.water_salts?(category) ->
        {:error, {:invalid, %{ions: ["Only a Water Salts ingredient has ion values"]}}}

      true ->
        checked =
          for {key, raw} <- ions do
            key = to_string(key)

            case Map.fetch(types, key) do
              {:ok, type} ->
                case Features.check_scalar(type, raw) do
                  {:ok, value} -> {:ok, type, value}
                  {:error, message} -> {:error, key, message}
                end

              :error ->
                {:error, key, "#{key} is not an ion"}
            end
          end

        case for({:error, key, message} <- checked, into: %{}, do: {key, [message]}) do
          errors when errors == %{} ->
            Repo.transaction(fn ->
              for {:ok, type, value} <- checked, do: write!(ingredient.id, type, value)
              get(ingredient.id)
            end)

          errors ->
            {:error, {:invalid, %{ions: errors}}}
        end
    end
  end

  def put(_ingredient, _ions), do: {:error, {:invalid, %{ions: ["must be a map by ion key"]}}}

  @doc """
  D65 Stop 3 (Stop 2 LEAD note 5): create (`ingredient` nil) or change an
  ingredient and set its `"ions"` in one transaction: both are written or
  neither (a bad ion value leaves the name as it was). Without `"ions"` it's
  the plain ingredient save. `{:ok, ingredient}` with `ions` filled.
  """
  def save_ingredient(ingredient, attrs) do
    Repo.transaction(fn ->
      saved =
        (ingredient || %Ingredient{})
        |> Ingredient.changeset(attrs)
        |> Repo.insert_or_update()
        |> case do
          {:ok, saved} -> saved
          {:error, changeset} -> Repo.rollback(changeset)
        end

      case Map.fetch(attrs, "ions") do
        {:ok, ions} ->
          case put(saved, ions) do
            {:ok, _} -> :ok
            {:error, reason} -> Repo.rollback(reason)
          end

        :error ->
          :ok
      end

      saved |> Repo.preload(:category, force: true) |> Map.put(:ions, get(saved.id))
    end)
  end

  defp write!(ingredient_id, type, nil) do
    Repo.delete_all(
      from(v in IngredientFeatureValue,
        where: v.ingredient_id == ^ingredient_id and v.feature_type_id == ^type.id
      )
    )
  end

  defp write!(ingredient_id, type, value) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert_all(
      IngredientFeatureValue,
      [
        %{
          ingredient_id: ingredient_id,
          feature_type_id: type.id,
          value: value,
          inserted_at: now,
          updated_at: now
        }
      ],
      on_conflict: {:replace, [:value, :updated_at]},
      conflict_target: [:ingredient_id, :feature_type_id]
    )
  end
end
