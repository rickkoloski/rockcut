defmodule RockcutApi.Ingredients.Products do
  @moduledoc """
  D60 §3.3: products. A product's manufacturer must hold the manufacturer
  role (D62 §3.2; the maltster on grain screens); its standard features
  (`features`, as `Features.validate/2`) apply to its ingredient's category.
  The list loads everything the grains list shows in a fixed number of
  queries, however many products: products with ingredient, category and
  manufacturer (1), standard features (2), offers with suppliers
  (3), their current prices (4), on-hand with its expired part (5) and, D65,
  the ingredients' ions (6); with
  any minimum on hand set, five more for `below_minimum` (D61 §3.5).
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory, IngredientLot}

  alias RockcutApi.Ingredients.{
    Catalog,
    Features,
    Inventory,
    Offers,
    Parties,
    Product,
    Reorder,
    SupplierOffer,
    Versions
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
      |> order_by([p, i, _c, _cp, m], [i.name, m.name, p.name, p.id])
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
    key = Catalog.ingredient_key(blank(attrs["ingredient_id"]))

    with :ok <- manufacturer(attrs),
         {:ok, attrs} <- category_rules(attrs, key, nil),
         {:ok, features} <- Features.validate(attrs["features"], attrs["ingredient_id"], :product) do
      Repo.transaction(fn ->
        product =
          %Product{}
          |> Product.changeset(attrs, key)
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

  D62 lead decisions 1, gap 9 (D61's pattern for orders and contracts): the
  Edit dialog sends back the `lock_version` it opened; a save from another
  version is refused (409) inside the write's transaction, so a dialog
  opened before someone else's save never puts their old values back. Every
  save bumps it.
  """
  def update(%Product{} = product, attrs) do
    ingredient_id = attrs["ingredient_id"] || product.ingredient_id
    key = Catalog.ingredient_key(blank(ingredient_id))

    with :ok <- manufacturer(attrs),
         {:ok, attrs} <-
           category_rules(Map.put_new(attrs, "form", product.form), key, product),
         {:ok, features} <- Features.validate(attrs["features"], ingredient_id, :product) do
      Repo.transaction(
        fn ->
          version = Versions.given!(attrs)
          product = Product |> Repo.get!(product.id) |> Versions.check!(version, "product")

          updated =
            product
            |> Product.changeset(attrs, key)
            |> Versions.bump()
            |> Repo.update()
            |> rollback_on_error()

          if updated.ingredient_id != product.ingredient_id do
            from(l in IngredientLot, where: l.product_id == ^product.id)
            |> Repo.update_all(set: [ingredient_id: updated.ingredient_id])
          end

          Features.write!({:product, product.id}, features)
          get!(product.id)
        end,
        mode: :immediate
      )
    end
  end

  @doc "Deletes a product with no offers, lots or contract lines (its standard features go with it)."
  def delete(%Product{} = product) do
    in_use =
      Repo.exists?(from(o in SupplierOffer, where: o.product_id == ^product.id)) or
        Repo.exists?(from(l in IngredientLot, where: l.product_id == ^product.id)) or
        Repo.exists?(
          from(l in RockcutApi.Ingredients.ContractLine, where: l.product_id == ^product.id)
        )

    if in_use,
      do: {:error, {:invalid, %{base: [@in_use]}}},
      else: Repo.delete(product)
  end

  @doc ~S'''
  "Rahr 2-Row", or "Weyermann Rauch Malt (Beech Smoked Malt)" with a
  product name (D60). D62 §3.3: a product with a form adds it after the
  ingredient: "Yakima Chief Citra T90 Pellet", "Hopsteiner Citra T90 Pellet
  (Lupomax)". Grain products have no form, so their names don't change.

  D65 decision 8: a product with no manufacturer reads its short name and
  "None": "Calcium Sulfate (Gypsum) Powder · None", and with a product name
  "Whirlfloc T · None" (`short_name/1`).
  '''
  def display_name(%Product{manufacturer: %{name: maker}, ingredient: %{name: ingredient}} = p) do
    item = Enum.join(Enum.reject([ingredient, blank(p.form)], &is_nil/1), " ")

    cond do
      is_nil(p.name) -> "#{maker} #{item}"
      is_nil(blank(p.form)) -> "#{maker} #{p.name} (#{item})"
      true -> "#{maker} #{item} (#{p.name})"
    end
  end

  def display_name(%Product{manufacturer_party_id: nil, ingredient: %{name: _}} = p),
    do: "#{short_name(p)} · None"

  def display_name(_), do: nil

  @doc """
  The product without its manufacturer: the ingredient and the product name
  ("Whirlfloc T"), else the ingredient and the form ("Calcium Sulfate
  (Gypsum) Powder", "Citra T90 Pellet"); nil when the ingredient isn't
  loaded.
  """
  def short_name(%Product{ingredient: %{name: ingredient}} = p) do
    [ingredient, if(p.name, do: p.name, else: blank(p.form))]
    |> Enum.reject(&is_nil/1)
    |> Enum.join(" ")
  end

  def short_name(_), do: nil

  @doc "A product's unit as the screens label it (\"tablets\" on a Tablet `each`; `Catalog.unit_label/2`)."
  def unit_label(nil), do: "lb"
  def unit_label(%Product{unit: unit, form: form}), do: Catalog.unit_label(unit || "lb", form)

  def unit_label(id) do
    case Repo.one(from(p in Product, where: p.id == ^id, select: {p.unit, p.form})) do
      nil -> "lb"
      {unit, form} -> Catalog.unit_label(unit, form)
    end
  end

  @doc "A product's unit (D62 §3.3), lb when there's no product."
  def unit(nil), do: "lb"
  def unit(%Product{unit: unit}), do: unit || "lb"

  def unit(id) do
    case Repo.one(from(p in Product, where: p.id == ^id, select: p.unit)) do
      nil -> "lb"
      unit -> unit
    end
  end

  @doc """
  D65 §4.3: an `each` product is counted in whole numbers. `:ok` for a
  whole quantity, or any quantity of another unit; else the refusal naming
  the product and its unit label: "Whirlfloc T is counted in whole tablets"
  (a Tablet), "… is counted in whole numbers" (any other `each`).
  `product` is a product or its id; nil (no product) is `:ok`.
  """
  def check_whole(nil, _quantity), do: :ok

  def check_whole(product, quantity) do
    product = if is_struct(product, Product), do: product, else: Repo.get(Product, product)

    cond do
      is_nil(product) or product.unit != "each" or is_nil(quantity) ->
        :ok

      whole?(quantity) ->
        :ok

      true ->
        product = Repo.preload(product, :ingredient)
        words = if unit_label(product) == "tablets", do: "tablets", else: "numbers"
        {:error, {:invalid, %{base: ["#{short_name(product)} is counted in whole #{words}"]}}}
    end
  end

  defp whole?(quantity) do
    case Ecto.Type.cast(:decimal, quantity) do
      {:ok, d} -> Decimal.eq?(d, Decimal.round(d, 0))
      :error -> true
    end
  end

  # Products with ingredient, its category (and parent, for the key) and the
  # manufacturer, joined (one query).
  defp base_query do
    from(p in Product,
      join: i in assoc(p, :ingredient),
      join: c in assoc(i, :category),
      left_join: cp in assoc(c, :parent),
      left_join: m in assoc(p, :manufacturer),
      preload: [ingredient: {i, category: {c, parent: cp}}, manufacturer: m]
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
    ions = RockcutApi.Ingredients.Ions.by_ingredient(Enum.map(products, & &1.ingredient_id))
    reorder = Reorder.status(products)

    Enum.map(products, fn p ->
      %{
        p
        | feature_values: Map.get(features, p.id, []),
          offers: Map.get(offers, p.id, []),
          on_hand: elem(Map.fetch!(stock, p.id), 0),
          expired: elem(Map.fetch!(stock, p.id), 1),
          below_minimum: Map.fetch!(reorder, p.id).below_minimum,
          ions: Map.get(ions, p.ingredient_id, %{})
      }
    end)
  end

  # D62 §3.3, §3.6: a category with forms needs one of them (hops: T90
  # Pellet, Cryo, Whole leaf, Extract); one without (grain) takes none. The
  # unit is the category's when it has only one (lb for grain and hops).
  # D65 §4.2: the lists are the ingredient's category's, or its child's
  # under Other Consumables; the unit is picked from them, by form for
  # sugars (Dry lb; Liquid lb or gal). An existing product's unit is kept
  # unless sent, and is fixed once the product has a lot (D62).
  defp category_rules(attrs, key, product) do
    form = blank(attrs["form"])
    category = ingredient_category(attrs["ingredient_id"] || (product && product.ingredient_id))

    case Catalog.forms(key, category) do
      [] when form != nil ->
        {:error, {:invalid, %{form: ["isn't set on this category's products"]}}}

      [] ->
        unit_rules(attrs, key, category, nil, product)

      _forms when form == nil ->
        {:error, {:invalid, %{form: ["can't be blank"]}}}

      forms ->
        cond do
          form not in forms ->
            {:error, {:invalid, %{form: ["must be one of #{Enum.join(forms, ", ")}"]}}}

          # D65 lead decisions 1: the form is fixed once the product has a lot, as
          # the unit is (it decides Brix on Liquid sugars and the "tablets" wording).
          product && product.form && form != product.form && has_lots?(product) ->
            {:error,
             {:invalid, %{form: ["This product has lots, so its form stays #{product.form}"]}}}

          true ->
            unit_rules(attrs, key, category, form, product)
        end
    end
  end

  defp has_lots?(product),
    do: Repo.exists?(from(l in IngredientLot, where: l.product_id == ^product.id))

  defp unit_rules(attrs, key, category, form, product) do
    units = Catalog.form_units(key, category, form)
    sent = blank(attrs["unit"])

    # One unit: it's that one. Grain and hops set it whatever is sent
    # (D62); a D65 product sent another is refused below (Dry sugar in gal).
    unit =
      case units do
        [only] when key in ["grains", "hops"] -> only
        [only] -> sent || only
        _ -> sent || (product && product.unit)
      end

    cond do
      units == [] ->
        {:ok, Map.delete(attrs, "unit")}

      is_nil(unit) ->
        {:error, {:invalid, %{unit: ["can't be blank"]}}}

      unit not in units and key == "sugars" ->
        {:error, {:invalid, %{unit: ["#{form} sugars are in #{Enum.join(units, " or ")}"]}}}

      unit not in units ->
        {:error, {:invalid, %{unit: ["must be one of #{Enum.join(units, ", ")}"]}}}

      product && unit != product.unit && has_lots?(product) ->
        {:error,
         {:invalid, %{unit: ["This product has lots, so its unit stays #{product.unit}"]}}}

      true ->
        {:ok, Map.put(attrs, "unit", unit)}
    end
  end

  defp ingredient_category(nil), do: nil

  defp ingredient_category(ingredient_id) do
    case Repo.get(Ingredient, ingredient_id) do
      nil -> nil
      ingredient -> Repo.get(IngredientCategory, ingredient.category_id)
    end
  end

  defp blank(v) when v in [nil, ""], do: nil
  defp blank(v), do: v

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
