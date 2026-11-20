defmodule RockcutApi.Ingredients.Catalog do
  @moduledoc """
  D62 (plan, Shape): the rules per ingredient category, by the top-level
  category's `key` (`grains`, `hops`, `fruits`, `spices`, `sugars`,
  `consumables`, `yeast`, `future`), never its name, so renaming a category
  in Settings changes nothing. A child category has no key of its own: it
  takes its parent's.

  Stage 2 manages grain and hops (products, packs, movements). The other
  D62 categories join in Stage 3, with their forms, units and packs.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory}

  @managed ~w(grains hops)
  @pack_names ~w(sack box)

  # D62 §3.6, amendments: a hop product is a variety in one of these forms.
  @hop_forms ["T90 Pellet", "Cryo", "Whole leaf", "Extract"]

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

  @doc "The key of a product's category (a product id); nil when unknown."
  def product_key(nil), do: nil

  def product_key(product_id) do
    from(p in RockcutApi.Ingredients.Product, where: p.id == ^product_id, select: p.ingredient_id)
    |> Repo.one()
    |> ingredient_key()
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
  and movements. Stage 2: grain and hops.
  """
  def managed?(key) when is_binary(key) or is_nil(key), do: key in @managed
  def managed?(category), do: category |> key() |> managed?()

  @doc """
  The unit a contract line counts in (D62 §3.7): `:packs` for grain (whole
  sacks at $/sack), `:lb` for hops (lb at $/lb, A1), nil (no contracts)
  otherwise.
  """
  def contract_unit("grains"), do: :packs
  def contract_unit("hops"), do: :lb
  def contract_unit(_key), do: nil

  @doc "The forms a category's products take (§3.6); none for grain, whose form is on the offer."
  def forms("hops"), do: @hop_forms
  def forms(_key), do: []

  @doc "The units a category's products may be in: lb for grain and hops."
  def units(key) when key in ["grains", "hops"], do: ["lb"]
  def units(_key), do: []

  @doc "Every pack name an offer or lot may use."
  def pack_names, do: @pack_names

  @doc """
  The one pack a category's offers and lots come in, `{name, size}`, or nil
  when it's free (decision 6: hops are always 11 lb boxes).
  """
  def fixed_pack("hops"), do: {"box", Decimal.new(11)}
  def fixed_pack(_key), do: nil

  @doc "The pack names a category's offers may use (sack for grain, box for hops)."
  def pack_names("grains"), do: ["sack"]
  def pack_names("hops"), do: ["box"]
  def pack_names(_key), do: @pack_names
end
