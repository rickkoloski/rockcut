defmodule RockcutApi.Ingredients.Valuation do
  @moduledoc """
  D61 §3.4, §3.6: what grain on hand is worth, as of a date (decision 37,
  computed live).

  A lot's on hand as of a date is the sum of its movements dated on or
  before it. Its cost per lb is that of its most recent costed receipt on or
  before the date (A4: a topped-up lot is valued at the latest price paid;
  ties by highest id). A lot with no costed receipt (opening amounts, hand
  receipts, every D60 lot) is valued at the price of its supplier's offer
  for its product in effect on the date ÷ the offer's sack size, and marked
  `estimated`; with no such price it's `unvalued` (no value).

  `lots/2` is the one as-of query the lot JSON (today) and the inventory
  totals share, so today's figures are the as-of figures for today.
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.{IngredientCategory, IngredientLot}
  alias RockcutApi.Ingredients.{Movement, Offers, Product, Products, SupplierOffer}

  # Only a Received movement from an order carries a cost (§3.3).
  @costed_kinds ~w(received)

  @doc """
  Fill each lot's `cost_per_lb`, `value`, `estimated` and `unvalued` as of
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
        | cost_per_lb: v.cost_per_lb,
          value: v.value,
          estimated: v.estimated,
          unvalued: v.unvalued
      }
    end)
  end

  @doc """
  `%{lot_id => %{on_hand_lb, cost_per_lb, value, estimated, unvalued}}` as
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
      lb = Map.get(on_hand, lot.id, zero)

      {cost, estimated} =
        case Map.fetch(costs, lot.id) do
          {:ok, cost} -> {cost, false}
          :error -> {Map.get(estimates, {lot.product_id, lot.supplier_party_id}), true}
        end

      {lot.id,
       %{
         on_hand_lb: lb,
         cost_per_lb: cost,
         value: cost && Decimal.round(Decimal.mult(lb, cost), 2),
         estimated: estimated and not is_nil(cost),
         unvalued: is_nil(cost)
       }}
    end)
  end

  @doc "On hand in lb of each lot as of `date`: its movements dated on or before it."
  def on_hand_as_of(lot_ids, %Date{} = date) do
    from(m in Movement,
      where: m.lot_id in ^lot_ids and m.occurred_on <= ^date,
      select: {m.lot_id, m.quantity_lb}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, q}, acc -> Map.update(acc, id, q, &Decimal.add(&1, q)) end)
  end

  @doc "Each lot's cost per lb as of `date`: its latest costed receipt on or before it (A4)."
  def costs_as_of(lot_ids, %Date{} = date) do
    from(m in Movement,
      where:
        m.lot_id in ^lot_ids and m.kind in ^@costed_kinds and not is_nil(m.unit_cost_per_lb) and
          m.occurred_on <= ^date,
      order_by: [asc: m.lot_id, desc: m.occurred_on, desc: m.id],
      select: {m.lot_id, m.unit_cost_per_lb}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, cost}, acc -> Map.put_new(acc, id, cost) end)
  end

  # `%{{product_id, supplier_id} => $/lb}`: the supplier's offer for the
  # product (the lowest id when several), its price in effect on `date` ÷
  # its sack size.
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
      {key, price && Decimal.round(Decimal.div(price.price_per_sack, offer.sack_size_lb), 6)}
    end)
  end

  @doc """
  Inventory totals (§3.6, decisions 32–34, 37): one row per maltster
  product with stock on `as_of`, from its lots (narrowed by `supplier_id`,
  the lots' supplier; `maltster_id`; `category_id` with its children): lb,
  the part in expired lots, sacks when all its stocked lots share a sack
  size, $ value (nil when no lot has one, lead decisions 1 gap 5), $/lb over
  the valued lb, whether any lot is estimated, and the lb with no value.
  Then the grand total of lb, expired lb (gap 6) and $.
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
        |> filter_maltster(params["maltster_id"])
        |> filter_category(params["category_id"])
        |> Repo.all()

      values = lots(Enum.map(lots, & &1.id), as_of)

      stocked = Enum.filter(lots, &Decimal.gt?(values[&1.id].on_hand_lb, 0))

      products =
        from(p in Product,
          where: p.id in ^Enum.uniq(Enum.map(stocked, & &1.product_id)),
          preload: [:maltster, ingredient: :category]
        )
        |> Repo.all()
        |> Map.new(&{&1.id, &1})

      rows =
        stocked
        |> Enum.group_by(& &1.product_id)
        |> Enum.map(fn {product_id, lots} -> row(products[product_id], lots, values) end)
        |> Enum.sort_by(&{&1.grain, &1.maltster, &1.display_name})

      {:ok,
       %{
         as_of: as_of,
         rows: rows,
         total: %{
           lb: sum(rows, :lb),
           expired_lb: sum(rows, :expired_lb),
           value: Decimal.round(sum(rows, :value), 2)
         }
       }}
    end
  end

  defp row(product, lots, values) do
    zero = Decimal.new(0)
    v = Enum.map(lots, &{&1, values[&1.id]})
    lb = Enum.reduce(v, zero, fn {_, x}, acc -> Decimal.add(acc, x.on_hand_lb) end)

    expired =
      for({%{status: "expired"}, x} <- v, do: x.on_hand_lb) |> Enum.reduce(zero, &Decimal.add/2)

    valued = for {_, x} <- v, not x.unvalued, do: x
    value = Enum.reduce(valued, zero, &Decimal.add(&2, &1.value))
    valued_lb = Enum.reduce(valued, zero, &Decimal.add(&2, &1.on_hand_lb))

    sizes = lots |> Enum.map(& &1.sack_size_lb) |> Enum.uniq_by(&(&1 && Decimal.normalize(&1)))

    %{
      product_id: product.id,
      display_name: Products.display_name(product),
      grain: product.ingredient.name,
      maltster: product.maltster.name,
      category: product.ingredient.category.name,
      lb: Decimal.round(lb, 2),
      expired_lb: Decimal.round(expired, 2),
      sacks:
        case sizes do
          [s] when not is_nil(s) -> Decimal.round(Decimal.div(lb, s), 2)
          _ -> nil
        end,
      value: if(valued != [], do: Decimal.round(value, 2)),
      per_lb: if(Decimal.gt?(valued_lb, 0), do: Decimal.round(Decimal.div(value, valued_lb), 4)),
      estimated: Enum.any?(v, fn {_, x} -> x.estimated end),
      unvalued_lb:
        Decimal.round(
          Enum.reduce(v, zero, fn {_, x}, acc ->
            if x.unvalued, do: Decimal.add(acc, x.on_hand_lb), else: acc
          end),
          2
        )
    }
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

  defp filter_maltster(query, value) when value in [nil, ""], do: query
  defp filter_maltster(query, id), do: where(query, [_l, p], p.maltster_party_id == ^id)

  defp filter_category(query, value) when value in [nil, ""], do: query

  defp filter_category(query, id) do
    children = from(c in IngredientCategory, where: c.parent_id == ^id, select: c.id)
    where(query, [_l, _p, i], i.category_id == ^id or i.category_id in subquery(children))
  end
end
