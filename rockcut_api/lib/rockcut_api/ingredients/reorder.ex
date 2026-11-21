defmodule RockcutApi.Ingredients.Reorder do
  @moduledoc """
  D61 §3.5 (decisions 30, 31): a product's minimum on hand, in whole packs
  (D62 §3.5; sacks for grain), and what to order to get back to it.

  The packs are the product's **reorder offer**'s: the one picked on To
  order (`reorder_offer_id`, lead decisions 1 gap 4) while it's active, else
  the offer on its most recent order line while it's active, else its first
  active offer (by id). On hand is the
  stock in lots that aren't expired ÷ that offer's pack size; on order is
  the quantity on open order lines for the product (any supplier, any
  offer) ÷ that pack size too, to 2 decimals (lead decisions 1, item 20, as
  17a). To order =
  ⌈minimum − on hand − on order⌉ when above 0. Below minimum = on hand <
  minimum. D63 adds the future brews' need. A product with no offer has no
  pack size, so nothing is computed for it (`offer` nil). Quantities are in
  the product's unit.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.IngredientLot

  alias RockcutApi.Ingredients.{
    Movement,
    Offers,
    Product,
    Products,
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierOffer
  }

  @doc """
  The To order list: every product with a minimum, by name, each with its
  reorder offer (supplier and current price), `on_hand_packs`,
  `on_order_packs`, `to_order` and `below_minimum`.
  """
  def list do
    products =
      from(p in Product,
        where: not is_nil(p.min_on_hand_packs),
        preload: [:manufacturer, :ingredient]
      )
      |> Repo.all()

    status = status(products)

    products
    |> Enum.map(fn p -> Map.merge(%{product: p}, Map.fetch!(status, p.id)) end)
    |> Enum.sort_by(&{Products.display_name(&1.product), &1.product.id})
  end

  @doc """
  `%{product_id => %{offer, on_hand, on_hand_packs, on_order,
  on_order_packs, to_order, below_minimum}}` for `products` (four queries however many; none when
  no product has a minimum). Products without a minimum get nil figures and
  `below_minimum` false.
  """
  def status(products) do
    with_min = Enum.filter(products, &(&1.min_on_hand_packs != nil))
    ids = Enum.map(with_min, & &1.id)

    blank = %{
      offer: nil,
      on_hand: nil,
      on_hand_packs: nil,
      on_order: nil,
      on_order_packs: nil,
      to_order: nil,
      below_minimum: false
    }

    if ids == [] do
      Map.new(products, &{&1.id, blank})
    else
      offers = reorder_offers(with_min)
      usable = usable(ids)
      on_order = on_order(ids)

      Map.new(products, fn p ->
        offer = Map.get(offers, p.id)
        quantity = Map.get(usable, p.id, Decimal.new(0))

        cond do
          is_nil(p.min_on_hand_packs) ->
            {p.id, %{blank | offer: offer}}

          # No offer, no pack size: on hand in the unit only (To order says
          # "No offer"). No pack size to convert to: on order in packs as ordered.
          is_nil(offer) ->
            {ordered, ordered_packs} = Map.get(on_order, p.id, {Decimal.new(0), 0})

            {p.id, %{blank | on_hand: quantity, on_order: ordered, on_order_packs: ordered_packs}}

          true ->
            on_hand = Decimal.round(Decimal.div(quantity, offer.pack_size), 2)
            {ordered_quantity, _} = Map.get(on_order, p.id, {Decimal.new(0), 0})
            ordered_in_size = Decimal.round(Decimal.div(ordered_quantity, offer.pack_size), 2)
            ordered = packs(ordered_in_size)

            need =
              Decimal.new(p.min_on_hand_packs)
              |> Decimal.sub(on_hand)
              |> Decimal.sub(ordered_in_size)
              |> Decimal.round(0, :ceiling)
              |> Decimal.to_integer()

            {p.id,
             %{
               offer: offer,
               on_hand: quantity,
               on_hand_packs: on_hand,
               on_order: ordered_quantity,
               on_order_packs: ordered,
               to_order: max(need, 0),
               below_minimum: Decimal.lt?(on_hand, p.min_on_hand_packs)
             }}
        end
      end)
    end
  end

  # The product's picked offer, else the offer on its most recent order line
  # (order date, then id), else its first active offer by id; each only
  # while active; current prices filled.
  defp reorder_offers(products) do
    product_ids = Enum.map(products, & &1.id)

    recent =
      from(l in PurchaseOrderLine,
        join: o in PurchaseOrder,
        on: o.id == l.order_id,
        join: f in SupplierOffer,
        on: f.id == l.offer_id,
        where: f.product_id in ^product_ids,
        order_by: [asc: f.product_id, desc: o.ordered_on, desc: o.id, desc: l.id],
        select: {f.product_id, l.offer_id}
      )
      |> Repo.all()
      |> Enum.reduce(%{}, fn {p, o}, acc -> Map.put_new(acc, p, o) end)

    offers =
      from(f in SupplierOffer,
        where: f.product_id in ^product_ids,
        order_by: f.id,
        preload: :supplier
      )
      |> Repo.all()
      |> Offers.put_current_prices()

    by_id = Map.new(offers, &{&1.id, &1})

    first_active =
      offers
      |> Enum.filter(& &1.active)
      |> Enum.reduce(%{}, fn o, acc -> Map.put_new(acc, o.product_id, o) end)

    # Lead, Stop 2 note 7: the latest order's offer only while it's active.
    Map.new(products, fn %{id: id} = p ->
      picked = p.reorder_offer_id && by_id[p.reorder_offer_id]
      latest = recent[id] && by_id[recent[id]]

      {id,
       cond do
         picked && picked.active -> picked
         latest && latest.active -> latest
         true -> first_active[id]
       end}
    end)
    |> Map.reject(fn {_, o} -> is_nil(o) end)
  end

  # The quantity in lots that aren't expired, per product.
  defp usable(product_ids) do
    from(m in Movement,
      join: l in IngredientLot,
      on: l.id == m.lot_id,
      where: l.product_id in ^product_ids and l.status != "expired",
      select: {l.product_id, m.quantity}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, q}, acc -> Map.update(acc, id, q, &Decimal.add(&1, q)) end)
  end

  # Whole packs as JSON shows them, else to 2 decimals.
  defp packs(d) do
    d = Decimal.round(d, 2)

    if Decimal.eq?(d, Decimal.round(d, 0)),
      do: Decimal.to_integer(Decimal.round(d, 0)),
      else: Decimal.to_float(d)
  end

  # `{quantity, packs}` on open order lines, per product (any supplier, any offer).
  defp on_order(product_ids) do
    from(l in PurchaseOrderLine,
      join: o in PurchaseOrder,
      on: o.id == l.order_id,
      join: f in SupplierOffer,
      on: f.id == l.offer_id,
      where: f.product_id in ^product_ids and o.status == "open",
      select: {f.product_id, l.packs_ordered, f.pack_size}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, n, size}, acc ->
      Map.update(acc, id, {Decimal.mult(size, n), n}, fn {q, s} ->
        {Decimal.add(q, Decimal.mult(size, n)), s + n}
      end)
    end)
  end
end
