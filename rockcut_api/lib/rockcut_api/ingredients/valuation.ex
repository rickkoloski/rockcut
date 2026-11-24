defmodule RockcutApi.Ingredients.Valuation do
  @moduledoc """
  D61 §3.4, §3.6: what stock on hand is worth, as of a date (decision 37,
  computed live). Quantities and costs are in the product's unit (D62
  §3.8; lb for grain).

  A lot's on hand as of a date is the sum of its movements dated on or
  before it. Its unit cost is that of its most recent costed receipt on or
  before the date (A4: a topped-up lot is valued at the latest price paid;
  ties by highest id). A lot with no costed receipt (opening amounts, hand
  receipts, every D60 lot) is valued at the price of its supplier's offer
  for its product in effect on the date ÷ the offer's pack size, and marked
  `estimated`; with no such price it's `unvalued` (no value).

  `lots/2` is the one as-of query the lot JSON (today) and the inventory
  totals share, so today's figures are the as-of figures for today.
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.{IngredientCategory, IngredientLot}
  alias RockcutApi.Ingredients.{Movement, Offers, Product, Products, SupplierOffer, Units}

  # Only a Received movement from an order carries a cost (§3.3).
  @costed_kinds ~w(received)

  @doc """
  Fill each lot's `unit_cost`, `value`, `estimated` and `unvalued` as of
  `date` (default today, Colorado), with on hand as of that date.
  """
  def put_values(lots, date \\ Tasks.today())

  def put_values([], _date), do: []

  def put_values(lots, date) when is_list(lots) do
    values = lots(Enum.map(lots, & &1.id), date)

    Enum.map(lots, fn lot ->
      v = Map.fetch!(values, lot.id)

      %{
        lot
        | unit_cost: v.unit_cost,
          value: v.value,
          estimated: v.estimated,
          unvalued: v.unvalued
      }
    end)
  end

  @doc """
  `%{lot_id => %{on_hand, unit_cost, value, estimated, unvalued}}` as
  of `date`, in four queries however many lots.
  """
  def lots(lot_ids, %Date{} = date) do
    lots =
      from(l in IngredientLot,
        where: l.id in ^lot_ids,
        select: %{id: l.id, product_id: l.product_id, supplier_party_id: l.supplier_party_id}
      )
      |> Repo.all()

    on_hand = on_hand_as_of(lot_ids, date)
    costs = costs_as_of(lot_ids, date)
    estimates = estimates(lots, date)
    zero = Decimal.new(0)

    Map.new(lots, fn lot ->
      quantity = Map.get(on_hand, lot.id, zero)

      {cost, estimated} =
        case Map.fetch(costs, lot.id) do
          {:ok, cost} -> {cost, false}
          :error -> {Map.get(estimates, {lot.product_id, lot.supplier_party_id}), true}
        end

      {lot.id,
       %{
         on_hand: quantity,
         unit_cost: cost,
         value: cost && Decimal.round(Decimal.mult(quantity, cost), 2),
         estimated: estimated and not is_nil(cost),
         unvalued: is_nil(cost)
       }}
    end)
  end

  @doc "On hand of each lot as of `date`: its movements dated on or before it."
  def on_hand_as_of(lot_ids, %Date{} = date) do
    from(m in Movement,
      where: m.lot_id in ^lot_ids and m.occurred_on <= ^date,
      select: {m.lot_id, m.quantity}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, q}, acc -> Map.update(acc, id, q, &Decimal.add(&1, q)) end)
  end

  @doc "Each lot's unit cost as of `date`: its latest costed receipt on or before it (A4)."
  def costs_as_of(lot_ids, %Date{} = date) do
    from(m in Movement,
      where:
        m.lot_id in ^lot_ids and m.kind in ^@costed_kinds and not is_nil(m.unit_cost) and
          m.occurred_on <= ^date,
      order_by: [asc: m.lot_id, desc: m.occurred_on, desc: m.id],
      select: {m.lot_id, m.unit_cost}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, cost}, acc -> Map.put_new(acc, id, cost) end)
  end

  # `%{{product_id, supplier_id} => $/unit}`: the supplier's offer for the
  # product (the lowest id when several), its price in effect on `date` ÷
  # its pack size.
  defp estimates(lots, date) do
    pairs = lots |> Enum.map(&{&1.product_id, &1.supplier_party_id}) |> Enum.uniq()
    products = for {p, s} <- pairs, p && s, uniq: true, do: p

    offers =
      from(o in SupplierOffer, where: o.product_id in ^products, order_by: o.id)
      |> Repo.all()
      |> Enum.reduce(%{}, fn o, acc ->
        Map.put_new(acc, {o.product_id, o.supplier_party_id}, o)
      end)

    prices = Offers.current_prices(offers |> Map.values() |> Enum.map(& &1.id), date)

    Map.new(offers, fn {key, offer} ->
      price = Map.get(prices, offer.id)
      {key, price && Decimal.round(Decimal.div(price.price_per_pack, offer.pack_size), 6)}
    end)
  end

  @doc """
  Inventory totals (§3.6, decisions 32–34, 37): one row per product with
  stock on `as_of`, from its lots (narrowed by `supplier_id`, the lots'
  supplier; `manufacturer_id`; `category_id` with its children): the
  quantity in its unit, the part in expired lots, packs when all its
  stocked lots share a pack size, $ value (nil when no lot has one, lead
  decisions 1 gap 5), $ per unit over the valued quantity, whether any lot
  is estimated, and the quantity with no value. Then the grand total: $,
  and the quantity and expired part per unit (D62 §3.8: lb and gal are
  never added; `by_unit`).
  """
  def inventory_totals(params) do
    with {:ok, as_of} <- as_of(params["as_of"]) do
      lots =
        from(l in IngredientLot,
          join: p in Product,
          on: p.id == l.product_id,
          join: i in assoc(p, :ingredient),
          select: l
        )
        |> filter_lots(:supplier_party_id, params["supplier_id"])
        |> filter_manufacturer(params["manufacturer_id"])
        |> filter_no_manufacturer(params["manufacturer"])
        |> filter_category(params["category_id"])
        |> Repo.all()

      values = lots(Enum.map(lots, & &1.id), as_of)

      stocked = Enum.filter(lots, &Decimal.gt?(values[&1.id].on_hand, 0))

      products =
        from(p in Product,
          where: p.id in ^Enum.uniq(Enum.map(stocked, & &1.product_id)),
          preload: [:manufacturer, ingredient: [category: :parent]]
        )
        |> Repo.all()
        |> Map.new(&{&1.id, &1})

      rows =
        stocked
        |> Enum.group_by(& &1.product_id)
        |> Enum.map(fn {product_id, lots} -> row(products[product_id], lots, values) end)
        |> Enum.sort_by(&{&1.ingredient, &1.manufacturer, &1.display_name})

      {:ok,
       %{
         as_of: as_of,
         rows: rows,
         total: %{
           by_unit: by_unit(rows),
           value: Decimal.round(sum(rows, :value), 2)
         }
       }}
    end
  end

  defp row(product, lots, values) do
    zero = Decimal.new(0)
    v = Enum.map(lots, &{&1, values[&1.id]})
    quantity = Enum.reduce(v, zero, fn {_, x}, acc -> Decimal.add(acc, x.on_hand) end)

    expired =
      for({%{status: "expired"}, x} <- v, do: x.on_hand) |> Enum.reduce(zero, &Decimal.add/2)

    valued = for {_, x} <- v, not x.unvalued, do: x
    value = Enum.reduce(valued, zero, &Decimal.add(&2, &1.value))
    valued_quantity = Enum.reduce(valued, zero, &Decimal.add(&2, &1.on_hand))

    packs =
      lots
      |> Enum.map(&{&1.pack_name, &1.pack_size && Decimal.normalize(&1.pack_size)})
      |> Enum.uniq()

    %{
      product_id: product.id,
      display_name: Products.display_name(product),
      ingredient: product.ingredient.name,
      # D65 decision 8: a product with no manufacturer reads "None".
      manufacturer: if(product.manufacturer, do: product.manufacturer.name, else: "None"),
      unit_label: Products.unit_label(product),
      category: product.ingredient.category.name,
      category_id: product.ingredient.category_id,
      category_key: RockcutApi.Ingredients.Catalog.key(product.ingredient.category),
      form: product.form,
      unit: product.unit,
      quantity: Decimal.round(quantity, 2),
      expired: Decimal.round(expired, 2),
      pack_name:
        case packs do
          [{name, s}] when not is_nil(s) -> name
          _ -> nil
        end,
      packs:
        case packs do
          [{_, s}] when not is_nil(s) -> Decimal.round(Decimal.div(quantity, s), 2)
          _ -> nil
        end,
      value: if(valued != [], do: Decimal.round(value, 2)),
      per_unit:
        if(Decimal.gt?(valued_quantity, 0),
          do: Decimal.round(Decimal.div(value, valued_quantity), 4)
        ),
      estimated: Enum.any?(v, fn {_, x} -> x.estimated end),
      unvalued_quantity:
        Decimal.round(
          Enum.reduce(v, zero, fn {_, x}, acc ->
            if x.unvalued, do: Decimal.add(acc, x.on_hand), else: acc
          end),
          2
        )
    }
  end

  # The quantity and expired part summed per unit and label: D64 §13, a
  # yeast's bricks and pitchables (both `each`) are their own subtotals, as
  # tablets are (D65 gap 8); a unit with no label of its own reads as itself.
  defp by_unit(rows) do
    rows
    |> Enum.group_by(&{&1.unit, &1.unit_label || &1.unit})
    |> Enum.sort_by(fn {key, _} -> key end)
    |> Enum.map(fn {{unit, label}, rs} ->
      %{
        unit: unit,
        unit_label: Units.shared_label(unit, Enum.map(rs, fn _ -> label end)),
        quantity: sum(rs, :quantity),
        expired: sum(rs, :expired)
      }
    end)
  end

  @doc "An `as_of` date param: today when absent; not after today (422)."
  def as_of(value) when value in [nil, ""], do: {:ok, Tasks.today()}

  def as_of(value) do
    case Ecto.Type.cast(:date, value) do
      {:ok, %Date{} = d} ->
        if Date.after?(d, Tasks.today()),
          do: {:error, {:invalid, %{as_of: ["can't be after today"]}}},
          else: {:ok, d}

      _ ->
        {:error, {:invalid, %{as_of: ["is invalid"]}}}
    end
  end

  defp sum(rows, key),
    do: Enum.reduce(rows, Decimal.new(0), &Decimal.add(&2, Map.fetch!(&1, key) || 0))

  defp filter_lots(query, _field, value) when value in [nil, ""], do: query
  defp filter_lots(query, field, value), do: where(query, [l], field(l, ^field) == ^value)

  defp filter_manufacturer(query, value) when value in [nil, ""], do: query
  defp filter_manufacturer(query, id), do: where(query, [_l, p], p.manufacturer_party_id == ^id)

  # Lead decisions 1 (gap 9): `manufacturer=none`, the products with no
  # manufacturer (D65 decision 8). Not a `*_id`: ids there are numbers.
  defp filter_no_manufacturer(query, "none"),
    do: where(query, [_l, p], is_nil(p.manufacturer_party_id))

  defp filter_no_manufacturer(query, _), do: query

  defp filter_category(query, value) when value in [nil, ""], do: query

  defp filter_category(query, id) do
    children = from(c in IngredientCategory, where: c.parent_id == ^id, select: c.id)
    where(query, [_l, _p, i], i.category_id == ^id or i.category_id in subquery(children))
  end
end
