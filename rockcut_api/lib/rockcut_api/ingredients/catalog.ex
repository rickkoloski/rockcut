defmodule RockcutApi.Ingredients.Catalog do
  @moduledoc """
  D62 (plan, Shape): the rules per ingredient category, by the top-level
  category's `key` (`grains`, `hops`, `fruits`, `spices`, `sugars`,
  `consumables`, `yeast`, `future`), never its name, so renaming a category
  in Settings changes nothing. A child category has no key of its own: it
  takes its parent's.

  Stage 1 manages grain only (products, packs, movements). Hops and the
  other D62 categories join in Stages 2–3, which also fill in `forms/1`,
  `units/1` and `pack_names/0`.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory}

  @managed ~w(grains)
  @pack_names ~w(sack)

  @doc """
  The key of a category (`%IngredientCategory{}` with its parent loaded, or
  an id): its own, else its parent's. nil for a category with neither.
  """
  def key(%IngredientCategory{key: key}) when is_binary(key), do: key

  def key(%IngredientCategory{parent: %IngredientCategory{key: key}}) when is_binary(key),
    do: key

  def key(%IngredientCategory{parent_id: nil}), do: nil
  def key(%IngredientCategory{id: id}), do: key(id)

  def key(id) when is_integer(id) or is_binary(id) do
    from(c in IngredientCategory,
      left_join: p in IngredientCategory,
      on: p.id == c.parent_id,
      where: c.id == ^id,
      select: coalesce(c.key, p.key)
    )
    |> Repo.one()
  end

  def key(_), do: nil

  @doc "The key of an ingredient's category (an ingredient id); nil when unknown."
  def ingredient_key(nil), do: nil

  def ingredient_key(ingredient_id) do
    from(i in Ingredient,
      join: c in IngredientCategory,
      on: c.id == i.category_id,
      left_join: p in IngredientCategory,
      on: p.id == c.parent_id,
      where: i.id == ^ingredient_id,
      select: coalesce(c.key, p.key)
    )
    |> Repo.one()
  end

  @doc "The ids of the categories with these keys and their children."
  def category_ids(keys) when is_list(keys) do
    from(c in IngredientCategory,
      left_join: p in IngredientCategory,
      on: p.id == c.parent_id,
      where: c.key in ^keys or p.key in ^keys,
      select: c.id
    )
    |> Repo.all()
  end

  @doc """
  Whether a category (a key, or anything `key/1` takes) has products, packs
  and movements. Stage 1: grain only.
  """
  def managed?(key) when is_binary(key) or is_nil(key), do: key in @managed
  def managed?(category), do: category |> key() |> managed?()

  @doc "The unit a contract line counts in: `:packs` for grain, nil (no contracts) otherwise."
  def contract_unit("grains"), do: :packs
  def contract_unit(_key), do: nil

  @doc "The forms a category's products take (Stage 2–3: hops, fruit, ...); none for grain."
  def forms(_key), do: []

  @doc "The units a category's products may be in. Stage 1: lb (grain)."
  def units("grains"), do: ["lb"]
  def units(_key), do: []

  @doc "The pack names an offer may use. Stage 1: sack (grain)."
  def pack_names, do: @pack_names
end
