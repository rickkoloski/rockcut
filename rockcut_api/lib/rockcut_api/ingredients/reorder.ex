defmodule RockcutApi.Ingredients.Reorder do
  @moduledoc """
  D61 §3.5 (decisions 30, 31): a maltster product's minimum on hand, in
  whole sacks, and what to order to get back to it.

  The sacks are the product's **reorder offer**'s: the offer on its most
  recent order line, else its first active offer (by id). On hand is the
  stock in lots that aren't expired ÷ that offer's sack size; on order is
  the sacks on open order lines for the product (any supplier). To order =
  ⌈minimum − on hand − on order⌉ when above 0. Below minimum = on hand <
  minimum. D63 adds the future brews' need. A product with no offer has no
  sack size, so nothing is computed for it (`offer` nil).
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
  reorder offer (supplier and current price), `on_hand_sacks`,
  `on_order_sacks`, `to_order` and `below_minimum`.
  """
  def list do
    products =
      from(p in Product,
        where: not is_nil(p.min_on_hand_sacks),
        preload: [:maltster, :ingredient]
      )
      |> Repo.all()

    status = status(products)

    products
    |> Enum.map(fn p -> Map.merge(%{product: p}, Map.fetch!(status, p.id)) end)
    |> Enum.sort_by(&{Products.display_name(&1.product), &1.product.id})
  end

  @doc """
  `%{product_id => %{offer, on_hand_sacks, on_order_sacks, to_order,
  below_minimum}}` for `products` (four queries however many; none when
  no product has a minimum). Products without a minimum get nil figures and
  `below_minimum` false.
  """
  def status(products) do
    with_min = Enum.filter(products, &(&1.min_on_hand_sacks != nil))
    ids = Enum.map(with_min, & &1.id)

    blank = %{
      offer: nil,
      on_hand_sacks: nil,
      on_order_sacks: nil,
      to_order: nil,
      below_minimum: false
    }

    if ids == [] do
      Map.new(products, &{&1.id, blank})
    else
      offers = reorder_offers(ids)
      usable = usable_lb(ids)
      on_order = on_order(ids)

      Map.new(products, fn p ->
        offer = Map.get(offers, p.id)

        cond do
          is_nil(p.min_on_hand_sacks) or is_nil(offer) ->
            {p.id, %{blank | offer: offer}}

          true ->
            on_hand =
              Decimal.round(
                Decimal.div(Map.get(usable, p.id, Decimal.new(0)), offer.sack_size_lb),
                2
              )

            ordered = Map.get(on_order, p.id, 0)

            need =
              Decimal.new(p.min_on_hand_sacks)
              |> Decimal.sub(on_hand)
              |> Decimal.sub(ordered)
              |> Decimal.round(0, :ceiling)
              |> Decimal.to_integer()

            {p.id,
             %{
               offer: offer,
               on_hand_sacks: on_hand,
               on_order_sacks: ordered,
               to_order: max(need, 0),
               below_minimum: Decimal.lt?(on_hand, p.min_on_hand_sacks)
             }}
        end
      end)
    end
  end

  # The offer on each product's most recent order line (order date, then
  # id), else its first active offer by id; current prices filled.
  defp reorder_offers(product_ids) do
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

    Map.new(product_ids, fn id ->
      {id, (recent[id] && by_id[recent[id]]) || first_active[id]}
    end)
    |> Map.reject(fn {_, o} -> is_nil(o) end)
  end

  # lb in lots that aren't expired, per product.
  defp usable_lb(product_ids) do
    from(m in Movement,
      join: l in IngredientLot,
      on: l.id == m.lot_id,
      where: l.product_id in ^product_ids and l.status != "expired",
      select: {l.product_id, m.quantity_lb}
    )
    |> Repo.all()
    |> Enum.reduce(%{}, fn {id, q}, acc -> Map.update(acc, id, q, &Decimal.add(&1, q)) end)
  end

  # Sacks on open order lines, per product (any supplier).
  defp on_order(product_ids) do
    from(l in PurchaseOrderLine,
      join: o in PurchaseOrder,
      on: o.id == l.order_id,
      join: f in SupplierOffer,
      on: f.id == l.offer_id,
      where: f.product_id in ^product_ids and o.status == "open",
      group_by: f.product_id,
      select: {f.product_id, sum(l.sacks_ordered)}
    )
    |> Repo.all()
    |> Map.new()
  end
end
