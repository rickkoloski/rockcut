defmodule RockcutApi.Ingredients.Products do
  @moduledoc """
  D60 §3.3: maltster products. A product's maltster must hold the maltster
  role; its standard features (`features`, as `Features.validate/2`) apply
  to its grain's category. The list loads everything the grains list shows
  in a fixed number of queries, however many products: products with grain,
  category and maltster (1), standard features (2), offers with suppliers
  (3), their current prices (4) and on-hand with its expired part (5).
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{IngredientCategory, IngredientLot}
  alias RockcutApi.Ingredients.{Features, Inventory, Offers, Parties, Product, SupplierOffer}

  @in_use "This product has offers or lots; deactivate it instead"

  @doc """
  Products by grain name, maltster name and product name. Filters:
  `ingredient_id`, `category_id` (with its children), `maltster_id`,
  `supplier_id` (has an offer from), `on_hand=true` (more than 0 lb).
  """
  def list(params \\ %{}) do
    products =
      base_query()
      |> filter(:ingredient_id, params["ingredient_id"])
      |> filter_category(params["category_id"])
      |> filter(:maltster_party_id, params["maltster_id"])
      |> filter_supplier(params["supplier_id"])
      |> order_by([p, i, _c, m], [i.name, m.name, p.name, p.id])
      |> Repo.all()
      |> fill()

    if params["on_hand"] in ["true", true],
      do: Enum.filter(products, &Decimal.gt?(&1.on_hand_lb, 0)),
      else: products
  end

  def get!(id) do
    base_query()
    |> where([p], p.id == ^id)
    |> Repo.one!()
    |> List.wrap()
    |> fill()
    |> hd()
  end

  def get(id) do
    case Repo.get(Product, id) do
      nil -> nil
      _ -> get!(id)
    end
  end

  def create(attrs) do
    with :ok <- maltster(attrs),
         {:ok, features} <- Features.validate(attrs["features"], attrs["ingredient_id"]) do
      Repo.transaction(fn ->
        product =
          %Product{}
          |> Product.changeset(attrs)
          |> Repo.insert()
          |> rollback_on_error()

        Features.write!({:product, product.id}, features)
        get!(product.id)
      end)
    end
  end

  @doc """
  Change a product. A new grain moves its lots along (a lot of "Rahr
  2-Row" is 2-Row). `features` change key by key (nil drops one).
  """
  def update(%Product{} = product, attrs) do
    ingredient_id = attrs["ingredient_id"] || product.ingredient_id

    with :ok <- maltster(attrs),
         {:ok, features} <- Features.validate(attrs["features"], ingredient_id) do
      Repo.transaction(fn ->
        updated =
          product
          |> Product.changeset(attrs)
          |> Repo.update()
          |> rollback_on_error()

        if updated.ingredient_id != product.ingredient_id do
          from(l in IngredientLot, where: l.product_id == ^product.id)
          |> Repo.update_all(set: [ingredient_id: updated.ingredient_id])
        end

        Features.write!({:product, product.id}, features)
        get!(product.id)
      end)
    end
  end

  @doc "Deletes a product with no offers or lots (its standard features go with it)."
  def delete(%Product{} = product) do
    in_use =
      Repo.exists?(from(o in SupplierOffer, where: o.product_id == ^product.id)) or
        Repo.exists?(from(l in IngredientLot, where: l.product_id == ^product.id))

    if in_use,
      do: {:error, {:invalid, %{base: [@in_use]}}},
      else: Repo.delete(product)
  end

  @doc ~S|"Rahr 2-Row", or "Weyermann Rauch Malt (Beech Smoked Malt)" with a product name.|
  def display_name(%Product{maltster: %{name: maltster}, ingredient: %{name: grain}, name: nil}),
    do: "#{maltster} #{grain}"

  def display_name(%Product{maltster: %{name: maltster}, ingredient: %{name: grain}, name: name}),
    do: "#{maltster} #{name} (#{grain})"

  def display_name(_), do: nil

  # Products with grain, its category and the maltster, joined (one query).
  defp base_query do
    from(p in Product,
      join: i in assoc(p, :ingredient),
      join: c in assoc(i, :category),
      join: m in assoc(p, :maltster),
      preload: [ingredient: {i, category: c}, maltster: m]
    )
  end

  # Features, offers with suppliers and current prices, and on-hand: four
  # more queries for the whole list.
  defp fill([]), do: []

  defp fill(products) do
    ids = Enum.map(products, & &1.id)

    features =
      from(v in RockcutApi.Ingredients.ProductFeatureValue,
        join: t in assoc(v, :feature_type),
        where: v.product_id in ^ids,
        preload: [feature_type: t]
      )
      |> Repo.all()
      |> Enum.group_by(& &1.product_id)

    offers =
      from(o in SupplierOffer,
        join: s in assoc(o, :supplier),
        where: o.product_id in ^ids,
        order_by: [s.name, o.id],
        preload: [supplier: s]
      )
      |> Repo.all()
      |> Offers.put_current_prices()
      |> Enum.group_by(& &1.product_id)

    stock = Inventory.stock_by_product(ids)

    Enum.map(products, fn p ->
      %{
        p
        | feature_values: Map.get(features, p.id, []),
          offers: Map.get(offers, p.id, []),
          on_hand_lb: elem(Map.fetch!(stock, p.id), 0),
          expired_lb: elem(Map.fetch!(stock, p.id), 1)
      }
    end)
  end

  defp maltster(attrs) do
    case Map.fetch(attrs, "maltster_party_id") do
      {:ok, id} when id not in [nil, ""] ->
        if Parties.has_role?(id, "maltster"),
          do: :ok,
          else: {:error, {:invalid, %{maltster_party_id: ["must be a maltster"]}}}

      _ ->
        :ok
    end
  end

  defp filter(query, _field, value) when value in [nil, ""], do: query
  defp filter(query, field, value), do: where(query, [p], field(p, ^field) == ^value)

  defp filter_category(query, value) when value in [nil, ""], do: query

  defp filter_category(query, id) do
    children = from(c in IngredientCategory, where: c.parent_id == ^id, select: c.id)
    where(query, [_p, i], i.category_id == ^id or i.category_id in subquery(children))
  end

  defp filter_supplier(query, value) when value in [nil, ""], do: query

  defp filter_supplier(query, id) do
    offered = from(o in SupplierOffer, where: o.supplier_party_id == ^id, select: o.product_id)
    where(query, [p], p.id in subquery(offered))
  end

  defp rollback_on_error({:ok, record}), do: record
  defp rollback_on_error({:error, changeset}), do: Repo.rollback(changeset)
end
