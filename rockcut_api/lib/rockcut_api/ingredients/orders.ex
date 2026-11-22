defmodule RockcutApi.Ingredients.Orders do
  @moduledoc """
  D61 §3.2–3.3: purchase orders (Silverston's Order and Order Item) and
  receiving them.

  An order is placed when it's saved (decision 42): a supplier, an order
  date (not after today, Colorado), an optional expected date (not before
  the order date) and reference, and lines of that supplier's offers in
  whole packs at a price per pack (D62 §3.5: sacks for grain; the offer's
  current price when none is given; $0.00 allowed). While `open` any Brewery member may change it
  (header and lines, sent as a full list) or cancel it (decision 46); a
  received or cancelled order is read-only (409).

  Receiving (decisions 24, 29, 43, 44, 49; A3) records every line at once in
  one `BEGIN IMMEDIATE` transaction, the status re-checked inside it: each
  line's packs received (default: as ordered; 0 allowed), split across lots
  by `allocations`, each a Received movement carrying the order line and its
  cost per unit of the product. With no allocations a line goes to the product's previous
  lot; a lot number the product already has (any case, trimmed) adds to that
  lot, and a new one makes a lot as Add lot does. A short delivery closes the
  order; there's no back-order.
  """
  import Ecto.Query

  alias RockcutApi.{Ids, Repo, Tasks}
  alias RockcutApi.Brewing.IngredientLot

  alias RockcutApi.Ingredients.{
    Catalog,
    Features,
    Inventory,
    Movement,
    Offers,
    Parties,
    Party,
    Products,
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierOffer,
    Units,
    Versions
  }

  @preloads [
    :supplier,
    :created_by,
    :received_by,
    :cancelled_by,
    lines:
      {from(l in PurchaseOrderLine, order_by: l.id),
       offer: [product: [:manufacturer, :ingredient]]}
  ]

  @doc """
  Orders, open first, then newest order date. Filters: `supplier_id`,
  `status`, `from` and `to` (order date, inclusive).
  """
  def list(params \\ %{}) do
    PurchaseOrder
    |> filter(:supplier_party_id, params["supplier_id"])
    |> filter(:status, params["status"])
    |> date_from(cast_date(params["from"]))
    |> date_to(cast_date(params["to"]))
    |> order_by([o],
      asc: fragment("CASE WHEN ? = 'open' THEN 0 ELSE 1 END", o.status),
      desc: o.ordered_on,
      desc: o.id
    )
    |> Repo.all()
    |> Repo.preload(@preloads)
  end

  def get!(id), do: PurchaseOrder |> Repo.get!(id) |> Repo.preload(@preloads)

  def create(attrs, user) do
    write(fn ->
      order =
        %PurchaseOrder{}
        |> PurchaseOrder.changeset(
          attrs
          |> header()
          |> Map.merge(%{"status" => "open", "created_by_id" => user.id})
        )
        |> check_header()
        |> save!()

      put_lines!(order, attrs["lines"])
      order.id
    end)
  end

  @doc """
  Replace an open order's header and lines (409 once received or
  cancelled, or when it changed since the version given, lead decisions 2).
  """
  def update(%PurchaseOrder{} = order, attrs) do
    write(fn ->
      version = Versions.given!(attrs)
      order = open!(order.id) |> Versions.check!(version, "order")

      order =
        order
        |> PurchaseOrder.changeset(header(attrs))
        |> Versions.bump()
        |> check_header()
        |> save!()

      if Map.has_key?(attrs, "lines"), do: put_lines!(order, attrs["lines"])
      order.id
    end)
  end

  @doc "Cancel an open order (409 once received or cancelled)."
  def cancel(%PurchaseOrder{} = order, user) do
    write(fn ->
      open!(order.id)
      |> Ecto.Changeset.change(
        status: "cancelled",
        cancelled_by_id: user.id,
        cancelled_at: DateTime.truncate(DateTime.utc_now(), :second)
      )
      |> Versions.bump()
      |> Repo.update!()

      order.id
    end)
  end

  @doc """
  Receive an open order (spec §3.3). `received_on` (default today, not
  after it nor before the order date) and `lines`:
  `[%{id, packs_received, allocations}]`, every line of the order with its
  packs received (lead decisions 1, gap 15); a line with no allocations goes
  to its previous lot. An allocation is `%{lot_id, packs}` or
  `%{lot_number, packs, features, notes}`.
  """
  def receive(%PurchaseOrder{} = order, attrs, user) do
    write(fn ->
      order = open!(order.id)
      received_on = received_on!(attrs["received_on"], order)
      given = given_lines!(order, attrs["lines"])

      lot_ids =
        Enum.flat_map(order.lines, fn line ->
          entry = Map.get(given, line.id, %{})
          packs = packs!(entry["packs_received"], line, 0)

          ids =
            for {lot, n} <- allocations!(line, packs, entry["allocations"], received_on) do
              # D65 §4.3: an `each` receipt is whole (packs × a whole pack size).
              case Products.check_whole(
                     line.offer.product_id,
                     Decimal.mult(line.offer.pack_size, n)
                   ) do
                :ok -> :ok
                {:error, reason} -> Repo.rollback(reason)
              end

              %Movement{}
              |> Movement.changeset(%{
                lot_id: lot.id,
                kind: "received",
                quantity: Decimal.mult(line.offer.pack_size, n),
                occurred_on: received_on,
                purchase_order_line_id: line.id,
                unit_cost: unit_cost(line),
                entered_by_id: user.id
              })
              |> Repo.insert!()

              lot.id
            end

          line |> Ecto.Changeset.change(packs_received: packs) |> Repo.update!()
          ids
        end)

      Inventory.sync_status!(Enum.uniq(lot_ids))

      order
      |> Ecto.Changeset.change(
        status: "received",
        received_on: received_on,
        received_by_id: user.id,
        received_at: DateTime.truncate(DateTime.utc_now(), :second)
      )
      |> Versions.bump()
      |> Repo.update!()

      order.id
    end)
  end

  @doc "A line's cost per unit of the product: its price per pack ÷ the offer's pack size."
  def unit_cost(%PurchaseOrderLine{price_per_pack: price, offer: %{pack_size: size}}),
    do: Decimal.round(Decimal.div(price, size), 6)

  @doc """
  The packs a line counts (decision 35): received once the order is
  received, else ordered.
  """
  def counted_packs(%PurchaseOrder{status: "received"}, line), do: line.packs_received || 0
  def counted_packs(_order, line), do: line.packs_ordered

  @doc """
  The order's running total (§3.2): packs, the quantity per unit
  (`by_unit`, D62 §3.8) and $ over its lines (`counted_packs/2`), and with
  a supplier order target (decision 48; D62 A5: every pack counts) the
  next multiple of it at or above the packs ("36 of 40").
  """
  def totals(%PurchaseOrder{} = order) do
    {packs, dollars} =
      Enum.reduce(order.lines, {0, Decimal.new(0)}, fn line, {s, d} ->
        n = counted_packs(order, line)
        {s + n, Decimal.add(d, Decimal.mult(line.price_per_pack, n))}
      end)

    by_unit =
      order.lines
      |> Enum.map(
        &%{
          unit: Products.unit(&1.offer.product),
          unit_label: Products.unit_label(&1.offer.product),
          quantity: line_quantity(order, &1)
        }
      )
      |> sum_by_unit()

    target = order.supplier && order.supplier.order_target_packs

    %{
      total_packs: packs,
      by_unit: by_unit,
      total_dollars: Decimal.round(dollars, 2),
      target:
        target &&
          %{packs: target, next_multiple: max(target, div(packs + target - 1, target) * target)}
    }
  end

  @doc "A line's quantity in the product's unit at the packs it counts."
  def line_quantity(order, line),
    do: Decimal.round(Decimal.mult(line.offer.pack_size, counted_packs(order, line)), 2)

  # `[%{unit, unit_label, quantity}]` summed per unit, by unit name. Lead
  # decisions 1 (gap 8): the label is "tablets" when every row in it is a
  # Tablet product, else the unit ("each" for a mix).
  defp sum_by_unit(rows) do
    rows
    |> Enum.group_by(& &1.unit)
    |> Enum.sort_by(fn {unit, _} -> unit end)
    |> Enum.map(fn {unit, rs} ->
      %{
        unit: unit,
        unit_label: Units.shared_label(unit, Enum.map(rs, & &1.unit_label)),
        quantity: Enum.reduce(rs, Decimal.new(0), &Decimal.add(&2, &1.quantity))
      }
    end)
  end

  @doc """
  Order totals (§3.6, decisions 32, 35): one row per order line with an
  order date in `from`–`to` (inclusive, either open-ended), narrowed by
  `supplier_id` and `status` (open and received by default; `cancelled`
  only when asked for): packs ordered and received, and the quantity (in
  the product's unit) and $ at the packs the line counts
  (`counted_packs/2`). Then a subtotal per supplier and the grand total,
  their quantities per unit (D62 §3.8).
  """
  def order_totals(params) do
    with {:ok, from} <- range_date(params, "from"),
         {:ok, to} <- range_date(params, "to") do
      {:ok, order_totals(params, from, to)}
    end
  end

  # A `from`/`to` param: absent is open-ended; anything but a date is a 422
  # (lead decisions 1, gap 9).
  defp range_date(params, key) do
    case params[key] do
      v when v in [nil, ""] ->
        {:ok, nil}

      v ->
        case Ecto.Type.cast(:date, v) do
          {:ok, %Date{} = d} -> {:ok, d}
          _ -> {:error, {:invalid, %{key => ["is invalid"]}}}
        end
    end
  end

  defp order_totals(params, from, to) do
    statuses =
      if params["status"] in PurchaseOrder.statuses(),
        do: [params["status"]],
        else: ~w(open received)

    orders =
      PurchaseOrder
      |> filter(:supplier_party_id, params["supplier_id"])
      |> where([o], o.status in ^statuses)
      |> date_from(from)
      |> date_to(to)
      |> order_by([o], asc: o.ordered_on, asc: o.id)
      |> Repo.all()
      |> Repo.preload(@preloads)

    rows =
      for order <- orders, line <- order.lines do
        n = counted_packs(order, line)

        %{
          order_id: order.id,
          line_id: line.id,
          ordered_on: order.ordered_on,
          supplier_id: order.supplier_party_id,
          supplier: order.supplier.name,
          reference: order.reference,
          product: Products.display_name(line.offer.product),
          status: order.status,
          pack_name: line.offer.pack_name,
          packs_ordered: line.packs_ordered,
          packs_received: line.packs_received,
          unit: Products.unit(line.offer.product),
          unit_label: Products.unit_label(line.offer.product),
          quantity: line_quantity(order, line),
          dollars: Decimal.round(Decimal.mult(line.price_per_pack, n), 2),
          packs: n
        }
      end

    by_supplier =
      rows
      |> Enum.group_by(&{&1.supplier, &1.supplier_id})
      |> Enum.sort_by(fn {{name, id}, _} -> {name, id} end)
      |> Enum.map(fn {{name, id}, rs} ->
        Map.merge(%{supplier_id: id, supplier: name}, sums(rs))
      end)

    %{rows: rows, by_supplier: by_supplier, total: sums(rows)}
  end

  # Packs ordered and received too (lead decisions 1, gap 8). D62 lead
  # decisions 1, gap 11: sacks and boxes never add into one number, so
  # `by_pack` has them per pack name (by name); the plain `packs*` sums only
  # mean something when every row has the same pack.
  defp sums(rows) do
    %{
      packs: rows |> Enum.map(& &1.packs) |> Enum.sum(),
      packs_ordered: rows |> Enum.map(& &1.packs_ordered) |> Enum.sum(),
      packs_received: rows |> Enum.map(&(&1.packs_received || 0)) |> Enum.sum(),
      by_pack:
        rows
        |> Enum.group_by(& &1.pack_name)
        |> Enum.sort_by(fn {name, _} -> name end)
        |> Enum.map(fn {name, rs} ->
          %{
            pack_name: name,
            packs: rs |> Enum.map(& &1.packs) |> Enum.sum(),
            packs_ordered: rs |> Enum.map(& &1.packs_ordered) |> Enum.sum(),
            packs_received: rs |> Enum.map(&(&1.packs_received || 0)) |> Enum.sum()
          }
        end),
      by_unit: sum_by_unit(rows),
      dollars: Enum.reduce(rows, Decimal.new(0), &Decimal.add(&2, &1.dollars))
    }
  end

  ## Header and lines

  defp header(attrs) do
    attrs
    |> Map.take(~w(supplier_party_id ordered_on expected_on reference off_contract notes))
  end

  # §3.2: a supplier; the order date not after today; the expected date not
  # before it.
  defp check_header(changeset) do
    import Ecto.Changeset

    supplier = get_field(changeset, :supplier_party_id)
    ordered = get_field(changeset, :ordered_on)
    expected = get_field(changeset, :expected_on)

    changeset
    |> then(fn cs ->
      if supplier && changeset.valid? && !Parties.has_role?(supplier, "supplier"),
        do: add_error(cs, :supplier_party_id, "must be a supplier"),
        else: cs
    end)
    |> then(fn cs ->
      if ordered && Date.after?(ordered, Tasks.today()),
        do: add_error(cs, :ordered_on, "can't be after today"),
        else: cs
    end)
    |> then(fn cs ->
      if ordered && expected && Date.before?(expected, ordered),
        do: add_error(cs, :expected_on, "can't be before the order date"),
        else: cs
    end)
  end

  # The full list of lines replaces the order's: a line with an `id` (of
  # this order) is changed, one without is added, the rest are removed.
  defp put_lines!(order, lines) do
    unless is_list(lines) and lines != [],
      do: rollback(%{base: ["Add at least one line"]})

    supplier = Repo.get!(Party, order.supplier_party_id)

    existing =
      Map.new(
        Repo.all(from(l in PurchaseOrderLine, where: l.order_id == ^order.id)),
        &{&1.id, &1}
      )

    parsed = Enum.map(lines, &line_attrs/1)
    keep = parsed |> Enum.map(& &1["id"]) |> Enum.reject(&is_nil/1)

    for id <- keep,
        not Map.has_key?(existing, id),
        do: rollback(%{base: ["A line isn't on this order"]})

    from(l in PurchaseOrderLine, where: l.order_id == ^order.id and l.id not in ^keep)
    |> Repo.delete_all()

    for attrs <- parsed do
      offer = line_offer!(supplier, attrs["offer_id"])
      before = Map.get(existing, attrs["id"])

      # Lead, Stop 2 note 7: an inactive offer isn't put on a line; a line
      # already on it keeps it.
      if not offer.active and (is_nil(before) or before.offer_id != offer.id),
        do: rollback(%{base: ["That offer is inactive"]})

      price = Map.get(attrs, "price_per_pack")

      price =
        if price in [nil, ""],
          do: current_price!(offer),
          else: price

      (before || %PurchaseOrderLine{})
      |> PurchaseOrderLine.changeset(%{
        "order_id" => order.id,
        "offer_id" => offer.id,
        "packs_ordered" => attrs["packs_ordered"],
        "price_per_pack" => price
      })
      |> save!()
    end
  end

  defp line_attrs(line) when is_map(line) do
    line
    |> Map.new(fn {k, v} -> {to_string(k), v} end)
    |> Map.update("id", nil, &Ids.parse/1)
  end

  defp line_attrs(_), do: rollback(%{base: ["Each line needs an offer and packs"]})

  # The line's offer is one of the order's supplier's (§3.2).
  defp line_offer!(supplier, offer_id) do
    case Ids.parse(offer_id) && Repo.get(SupplierOffer, Ids.parse(offer_id)) do
      %SupplierOffer{supplier_party_id: id} = offer when id == supplier.id ->
        Repo.preload(offer, product: [:manufacturer, :ingredient])

      %SupplierOffer{} = offer ->
        offer = Repo.preload(offer, product: [:manufacturer, :ingredient])
        rollback(%{base: ["#{offer_label(offer)} isn't a #{supplier.name} offer"]})

      _ ->
        rollback(%{base: ["Pick the offer on each line"]})
    end
  end

  defp current_price!(offer) do
    case Offers.current_prices([offer.id])[offer.id] do
      nil ->
        rollback(%{base: ["Enter a price for #{offer_label(offer)}; it has no current price"]})

      price ->
        price.price_per_pack
    end
  end

  @doc "An offer as an order names it: its order name, else the product."
  def offer_label(%SupplierOffer{order_name: name}) when name not in [nil, ""], do: name
  def offer_label(%SupplierOffer{product: product}), do: Products.display_name(product)

  ## Receiving

  defp received_on!(value, order) when value in [nil, ""],
    do: received_on!(Tasks.today(), order)

  # Not after today, nor before the order date (lead decisions 1, gap 12).
  defp received_on!(value, order) do
    case Ecto.Type.cast(:date, value) do
      {:ok, date} ->
        cond do
          Date.after?(date, Tasks.today()) ->
            rollback(%{base: ["The received date can't be after today"]})

          Date.before?(date, order.ordered_on) ->
            rollback(%{base: ["The received date can't be before the order date"]})

          true ->
            date
        end

      _ ->
        rollback(%{received_on: ["is invalid"]})
    end
  end

  # `lines` from the body by line id: every id this order's, and every line
  # of the order there with its packs received (lead decisions 1, gap 15).
  defp given_lines!(order, lines) when is_list(lines) do
    ids = MapSet.new(order.lines, & &1.id)

    given =
      Map.new(lines, fn
        entry when is_map(entry) ->
          entry = Map.new(entry, fn {k, v} -> {to_string(k), v} end)
          id = Ids.parse(entry["id"])

          unless MapSet.member?(ids, id), do: rollback(%{base: ["A line isn't on this order"]})
          {id, entry}

        _ ->
          rollback(%{lines: ["is invalid"]})
      end)

    if Enum.any?(order.lines, &(given[&1.id]["packs_received"] in [nil, ""])),
      do: rollback(%{base: ["Every line needs a received quantity"]})

    given
  end

  defp given_lines!(_order, nil), do: rollback(%{base: ["Every line needs a received quantity"]})
  defp given_lines!(_order, _), do: rollback(%{lines: ["is invalid"]})

  # Whole packs, at least `min` (decision 24: packs, not the unit).
  defp packs!(value, line, min) do
    n =
      case value do
        v when is_integer(v) ->
          v

        v when is_binary(v) ->
          with({n, ""} <- Integer.parse(String.trim(v)), do: n, else: (_ -> nil))

        _ ->
          nil
      end

    if is_integer(n) and n >= min and n <= 100_000,
      do: n,
      else:
        rollback(%{
          base: [
            "Enter whole #{packs_word(line)} (#{min} or more) for #{offer_label(line.offer)}"
          ]
        })
  end

  # [{lot, packs}] for a line: the allocations given, adding up to the packs
  # received; with none, all of them into the previous lot (A3).
  defp allocations!(_line, 0, _given, _received_on), do: []

  defp allocations!(line, packs, given, _received_on) when given in [nil, []] do
    case previous_lot(line.offer) do
      nil -> rollback(%{base: ["Enter a lot number for #{product_name(line)}"]})
      lot -> [{lot, packs}]
    end
  end

  defp allocations!(line, packs, given, received_on) when is_list(given) do
    parts =
      Enum.map(given, fn
        a when is_map(a) ->
          a = Map.new(a, fn {k, v} -> {to_string(k), v} end)
          {a, packs!(a["packs"], line, 1)}

        _ ->
          rollback(%{
            base: ["Each lot for #{product_name(line)} needs a lot and #{packs_word(line)}"]
          })
      end)

    total = parts |> Enum.map(&elem(&1, 1)) |> Enum.sum()

    if total != packs do
      rollback(%{
        base: [
          "The lots for #{product_name(line)} add up to #{total} #{packs_word(line)}, " <>
            "not the #{packs} received"
        ]
      })
    end

    for {a, n} <- parts, do: {allocation_lot!(line, a, received_on), n}
  end

  defp allocations!(line, _packs, _given, _received_on),
    do: rollback(%{base: ["The lots for #{product_name(line)} are invalid"]})

  defp allocation_lot!(line, %{"lot_id" => id}, _received_on) when id not in [nil, ""] do
    case Ids.parse(id) && Repo.get(IngredientLot, Ids.parse(id)) do
      %IngredientLot{product_id: pid} = lot when pid == line.offer.product_id ->
        usable_lot!(lot, line.offer)

      _ ->
        rollback(%{base: ["That lot isn't one of #{product_name(line)}'s"]})
    end
  end

  defp allocation_lot!(line, %{"lot_number" => number} = a, received_on)
       when is_binary(number) do
    case String.trim(number) do
      "" ->
        rollback(%{base: ["Enter a lot number for #{product_name(line)}"]})

      number ->
        case Inventory.find_lot(line.offer.product_id, number) do
          nil -> new_lot!(line, number, a, received_on)
          lot -> lot |> usable_lot!(line.offer) |> same_values!(line, a)
        end
    end
  end

  defp allocation_lot!(line, _a, _received_on),
    do: rollback(%{base: ["Enter a lot number for #{product_name(line)}"]})

  # An expired lot takes no more (lead, Stop 2 note 6), and a lot holds one
  # pack size (A3): either needs a new lot number.
  defp usable_lot!(%IngredientLot{status: "expired"} = lot, _offer),
    do:
      rollback(%{
        base: ["Lot #{lot.lot_number || "##{lot.id}"} is expired; use a new lot number"]
      })

  defp usable_lot!(lot, offer) do
    if lot.pack_size && Decimal.eq?(lot.pack_size, offer.pack_size),
      do: lot,
      else:
        rollback(%{
          base: [
            "Lot #{lot.lot_number || "##{lot.id}"} holds " <>
              "#{size(lot.pack_size, Products.unit(offer.product))} " <>
              "#{Units.plural(lot.pack_name)}; use a new lot number"
          ]
        })
  end

  # D62 lead decisions 1, gap 10: a lot number the product already has adds
  # to that lot, so the crop year and features sent must be the lot's own
  # (or left out); a different one is refused, never dropped. Decisions 2,
  # gap 16: a blank is a value, so a feature sent blank (nil) that the lot
  # has, or sent with a value the lot has blank, differs too. Decisions 5,
  # gap 2: the crop year follows the same rule; only a key left out means
  # "leave its values".
  defp same_values!(lot, line, a) do
    features =
      case Features.validate(
             a["features"],
             line.offer.product.ingredient_id,
             :lot,
             line.offer.product.form
           ) do
        {:ok, features} -> for {type, attrs} <- features, do: {type, attrs && attrs.value}
        {:error, reason} -> Repo.rollback(reason)
      end

    crop_year = a["crop_year"]
    has = Map.new(lot_values(lot.id), &{&1.feature_type_id, &1.value})

    differs? =
      (Map.has_key?(a, "crop_year") and
         String.trim(to_string(crop_year)) != to_string(lot.crop_year)) or
        Enum.any?(features, fn {type, value} -> not same_value?(has[type.id], value) end)

    if differs? do
      values =
        cond do
          lot.crop_year -> ["crop year #{lot.crop_year}"]
          crop_year not in [nil, ""] -> ["no crop year"]
          true -> []
        end ++
          for {type, _} <- Enum.sort_by(features, &elem(&1, 0).id) do
            case has[type.id] do
              nil -> "no #{String.downcase(type.label)}"
              v -> "#{String.downcase(type.label)} #{places(v, type.decimals)}"
            end
          end

      rollback(%{
        base: [
          "Lot #{lot.lot_number} already exists with #{Enum.join(values, ", ")}; " <>
            "use a new lot number or leave its values"
        ]
      })
    end

    lot
  end

  defp same_value?(nil, nil), do: true
  defp same_value?(nil, _value), do: false
  defp same_value?(_has, nil), do: false
  defp same_value?(has, value), do: Decimal.eq?(has, value)

  defp lot_values(lot_id),
    do: Repo.all(from(v in RockcutApi.Ingredients.LotFeatureValue, where: v.lot_id == ^lot_id))

  defp places(d, decimals),
    do: d |> Decimal.round(decimals || 0) |> Decimal.to_string(:normal)

  # Add lot's lot (§3.3): supplier and pack from the offer, received on
  # the receipt's date, the product's standard specs with `features` over
  # them. D62 §3.4: a hop lot also takes its `crop_year` and must have its
  # alpha acid; the refusals name the product and lot, so the dialog shows
  # them on the line.
  defp new_lot!(line, number, a, received_on) do
    product = line.offer.product
    hops? = Catalog.ingredient_key(product.ingredient_id) == "hops"
    crop_year = if hops?, do: a["crop_year"]
    which = "#{product_name(line)} lot #{number}"

    if hops? and a["crop_year"] in [nil, ""],
      do: rollback(%{base: ["#{which}: enter its crop year"]})

    if not hops? and a["crop_year"] not in [nil, ""],
      do: rollback(%{base: ["#{which}: only hop lots have a crop year"]})

    features =
      case Features.validate(a["features"], product.ingredient_id, :lot, product.form) do
        {:ok, features} -> features
        {:error, reason} -> Repo.rollback(reason)
      end

    case Features.check_required(product.ingredient_id, features) do
      :ok ->
        :ok

      {:error, {:invalid, %{features: errors}}} ->
        rollback(%{base: ["#{which}: #{errors |> Map.values() |> List.flatten() |> hd()}"]})
    end

    changeset =
      IngredientLot.changeset(%IngredientLot{}, %{
        ingredient_id: product.ingredient_id,
        product_id: product.id,
        supplier_party_id: line.offer.supplier_party_id,
        lot_number: number,
        received_date: received_on,
        pack_name: line.offer.pack_name,
        pack_size: line.offer.pack_size,
        crop_year: crop_year,
        notes: a["notes"]
      })

    case changeset.errors[:crop_year] do
      {message, _} -> rollback(%{base: ["#{which}: the crop year #{message}"]})
      nil -> :ok
    end

    lot = save!(changeset)

    Features.copy_standard!(product.id, lot.id, Enum.map(features, fn {t, _} -> t.id end))
    Features.write!({:lot, lot.id}, features)
    lot
  end

  @doc """
  A3: the product's previous lot for an offer: its most recently received
  lot that isn't expired and holds the offer's pack size (then highest id).
  """
  def previous_lot(%SupplierOffer{product_id: product_id, pack_size: size}) do
    from(l in IngredientLot,
      where: l.product_id == ^product_id and l.status != "expired",
      order_by: [desc: l.received_date, desc: l.id]
    )
    |> Repo.all()
    |> Enum.find(&(&1.pack_size && Decimal.eq?(&1.pack_size, size)))
  end

  ## Helpers

  defp open!(id) do
    case Repo.preload(Repo.get!(PurchaseOrder, id), @preloads) do
      %PurchaseOrder{status: "open"} = order ->
        order

      %PurchaseOrder{status: status} ->
        Repo.rollback({:conflict, "This order has already been #{status}"})
    end
  end

  defp write(fun) do
    case Repo.transaction(fun, mode: :immediate) do
      {:ok, id} -> {:ok, get!(id)}
      error -> error
    end
  end

  defp save!(%Ecto.Changeset{} = changeset) do
    case Repo.insert_or_update(changeset) do
      {:ok, record} -> record
      {:error, cs} -> Repo.rollback(cs)
    end
  end

  defp rollback(errors), do: Repo.rollback({:invalid, errors})

  defp product_name(line), do: Products.display_name(line.offer.product)

  # The offer's pack name, plural ("sacks" for grain).
  defp packs_word(line), do: Units.plural(line.offer.pack_name)

  defp size(d, unit), do: "#{d |> Decimal.normalize() |> Decimal.to_string(:normal)} #{unit}"

  defp filter(query, _field, value) when value in [nil, ""], do: query
  defp filter(query, field, value), do: where(query, [o], field(o, ^field) == ^value)

  defp cast_date(value) do
    case Ecto.Type.cast(:date, value) do
      {:ok, %Date{} = d} -> d
      _ -> nil
    end
  end

  defp date_from(query, nil), do: query
  defp date_from(query, d), do: where(query, [o], o.ordered_on >= ^d)

  defp date_to(query, nil), do: query
  defp date_to(query, d), do: where(query, [o], o.ordered_on <= ^d)
end
