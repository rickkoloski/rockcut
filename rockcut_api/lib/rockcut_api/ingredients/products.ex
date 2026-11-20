defmodule RockcutApi.Ingredients.Products do
  @moduledoc """
  D60 §3.3: products. A product's manufacturer must hold the manufacturer
  role (D62 §3.2; the maltster on grain screens); its standard features
  (`features`, as `Features.validate/2`) apply to its ingredient's category.
  The list loads everything the grains list shows in a fixed number of
  queries, however many products: products with ingredient, category and
  manufacturer (1), standard features (2), offers with suppliers
  (3), their current prices (4) and on-hand with its expired part (5); with
  any minimum on hand set, five more for `below_minimum` (D61 §3.5).
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{IngredientCategory, IngredientLot}

  alias RockcutApi.Ingredients.{
    Features,
    Inventory,
    Offers,
    Parties,
    Product,
    Reorder,
    SupplierOffer
  }

  @in_use "This product has offers or lots; deactivate it instead"

  @doc """
  Products by ingredient name, manufacturer name and product name.
  Filters: `ingredient_id`, `category_id` (with its children),
  `manufacturer_id`, `supplier_id` (has an offer from), `on_hand=true`
  (more than 0 in its unit).
  """
  def list(params \\ %{}) do
    products =
      base_query()
      |> filter(:ingredient_id, params["ingredient_id"])
      |> filter_category(params["category_id"])
      |> filter(:manufacturer_party_id, params["manufacturer_id"])
      |> filter_supplier(params["supplier_id"])
      |> order_by([p, i, _c, m], [i.name, m.name, p.name, p.id])
      |> Repo.all()
      |> fill()

    if params["on_hand"] in ["true", true],
      do: Enum.filter(products, &Decimal.gt?(&1.on_hand, 0)),
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
    with :ok <- manufacturer(attrs),
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

    with :ok <- manufacturer(attrs),
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

  @doc ~S'''
  "Rahr 2-Row", or "Weyermann Rauch Malt (Beech Smoked Malt)" with a
  product name (D60). D62 §3.3: a product with a form adds it after the
  ingredient: "Yakima Chief Citra T90 Pellet", "Hopsteiner Citra T90 Pellet
  (Lupomax)". Grain products have no form, so their names don't change.
  '''
  def display_name(%Product{manufacturer: %{name: maker}, ingredient: %{name: ingredient}} = p) do
    item = Enum.join(Enum.reject([ingredient, blank_to_nil(p.form)], &is_nil/1), " ")

    cond do
      is_nil(p.name) -> "#{maker} #{item}"
      is_nil(blank_to_nil(p.form)) -> "#{maker} #{p.name} (#{item})"
      true -> "#{maker} #{item} (#{p.name})"
    end
  end

  def display_name(_), do: nil

  defp blank_to_nil(v) when v in [nil, ""], do: nil
  defp blank_to_nil(v), do: v

  @doc "A product's unit (D62 §3.3), lb when there's no product."
  def unit(nil), do: "lb"
  def unit(%Product{unit: unit}), do: unit || "lb"

  def unit(id) do
    case Repo.one(from(p in Product, where: p.id == ^id, select: p.unit)) do
      nil -> "lb"
      unit -> unit
    end
  end

  # Products with ingredient, its category and the manufacturer, joined (one query).
  defp base_query do
    from(p in Product,
      join: i in assoc(p, :ingredient),
      join: c in assoc(i, :category),
      join: m in assoc(p, :manufacturer),
      preload: [ingredient: {i, category: c}, manufacturer: m]
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
    reorder = Reorder.status(products)

    Enum.map(products, fn p ->
      %{
        p
        | feature_values: Map.get(features, p.id, []),
          offers: Map.get(offers, p.id, []),
          on_hand: elem(Map.fetch!(stock, p.id), 0),
          expired: elem(Map.fetch!(stock, p.id), 1),
          below_minimum: Map.fetch!(reorder, p.id).below_minimum
      }
    end)
  end

  defp manufacturer(attrs) do
    case Map.fetch(attrs, "manufacturer_party_id") do
      {:ok, id} when id not in [nil, ""] ->
        if Parties.has_role?(id, "manufacturer"),
          do: :ok,
          else: {:error, {:invalid, %{manufacturer_party_id: ["must be a manufacturer"]}}}

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
