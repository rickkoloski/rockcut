defmodule RockcutApi.Ingredients.Inventory do
  @moduledoc """
  D60 §3.7–3.8: lots, their stock (the sum of their movements, in lb) and
  the movements and counts that change it.

  Every write that reads stock first runs in one `BEGIN IMMEDIATE`
  transaction (as D32's series writes) and recomputes on-hand inside it, so
  two brewers can't take the same sacks. Outgoing movements and total counts
  share `allocate/3`: oldest lots first by received date, then lot id,
  skipping `expired` lots (Matt, 2026-11-17: a brewer can still pick an
  expired lot by hand, and a by-lot count includes it). A movement never
  takes a lot below 0. A lot's status follows its on-hand
  (`depleted` at 0, `available` above) unless it's `expired`; a lot with no
  movements at all (a non-grain lot, D62's) keeps the status it was given.

  D60 lead decisions 2: the refusals a person can meet are whole sentences
  under `base`, with quantities in the person's sacks/lb setting
  (`Units.quantity_display/1`); lb are kept to 2 decimals and a quantity
  under 0.01 lb is refused; no movement is dated after today (Colorado).
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory, IngredientLot, RecipeIngredient}
  alias RockcutApi.Ingredients.{Features, Movement, Parties, Product, Units, Valuation}

  @incoming ~w(opening received traded_in loaned_in)
  @outgoing ~w(used traded_out loaned_out)
  @with_partner ~w(traded_out traded_in loaned_out loaned_in)
  @initial ~w(opening received)

  @lot_preloads [
    :supplier,
    ingredient: :category,
    product: [:maltster, :ingredient],
    feature_values: :feature_type
  ]

  @movement_preloads [
    :partner,
    :entered_by,
    purchase_order_line: :order,
    lot: [product: [:maltster, :ingredient]]
  ]

  ## On hand

  @doc "On hand in lb for each of `lot_ids` (0 for a lot with no movements)."
  def on_hand_by_lot(lot_ids) do
    sums =
      from(m in Movement, where: m.lot_id in ^lot_ids, select: {m.lot_id, m.quantity_lb})
      |> Repo.all()
      |> sum_by()

    Map.new(lot_ids, &{&1, Map.get(sums, &1, Decimal.new(0))})
  end

  @doc "On hand in lb for each of `product_ids`: the sum over their lots."
  def on_hand_by_product(product_ids) do
    Map.new(stock_by_product(product_ids), fn {id, {on_hand, _expired}} -> {id, on_hand} end)
  end

  @doc """
  `{on_hand, expired}` in lb for each of `product_ids` (one query): the sum
  over all their lots, and the part of it in `expired` lots.
  """
  def stock_by_product(product_ids) do
    rows =
      from(m in Movement,
        join: l in IngredientLot,
        on: l.id == m.lot_id,
        where: l.product_id in ^product_ids,
        select: {l.product_id, l.status, m.quantity_lb}
      )
      |> Repo.all()

    on_hand = rows |> Enum.map(fn {id, _, q} -> {id, q} end) |> sum_by()

    expired =
      for({id, "expired", q} <- rows, do: {id, q})
      |> sum_by()

    zero = Decimal.new(0)

    Map.new(product_ids, fn id ->
      {id, {Map.get(on_hand, id, zero), Map.get(expired, id, zero)}}
    end)
  end

  @doc "On hand in lb of an ingredient (a grain): the sum over all its lots."
  def on_hand_for_ingredient(ingredient_id) do
    from(m in Movement,
      join: l in IngredientLot,
      on: l.id == m.lot_id,
      where: l.ingredient_id == ^ingredient_id,
      select: m.quantity_lb
    )
    |> Repo.all()
    |> Enum.reduce(Decimal.new(0), &Decimal.add/2)
  end

  @doc """
  Fill each lot's virtual `on_hand_lb` and `delete_blocked` (why it can't be
  deleted, or nil; lead decisions 3, gap 15).
  """
  def put_on_hand(lots) when is_list(lots) do
    ids = Enum.map(lots, & &1.id)
    on_hand = on_hand_by_lot(ids)
    blocked = delete_blocked(ids)

    Enum.map(
      lots,
      &%{&1 | on_hand_lb: Map.fetch!(on_hand, &1.id), delete_blocked: Map.fetch!(blocked, &1.id)}
    )
  end

  def put_on_hand(%IngredientLot{} = lot), do: hd(put_on_hand([lot]))

  defp sum_by(pairs) do
    Enum.reduce(pairs, %{}, fn {id, q}, acc ->
      Map.update(acc, id, q, &Decimal.add(&1, q))
    end)
  end

  ## Allocation

  @doc """
  Which lots of `product_id` give `quantity` lb (a positive Decimal):
  `:oldest_first` takes from the oldest lot with stock (received date, then
  lot id), then the next, skipping expired lots; a lot id takes it all from
  that lot (expired or not), which must be the product's. `{:ok, [{lot,
  lb}]}`, or `{:error, :short, on_hand}` with the product's non-expired (or
  that lot's) on-hand. Reads stock as it is now: call it inside the write
  transaction.
  """
  def allocate(product_id, %Decimal{} = quantity, :oldest_first) do
    lots = product_id |> product_lots() |> Enum.reject(&(&1.status == "expired"))
    on_hand = on_hand_by_lot(Enum.map(lots, & &1.id))
    total = Enum.reduce(Map.values(on_hand), Decimal.new(0), &Decimal.add/2)

    if Decimal.gt?(quantity, total) do
      {:error, :short, total}
    else
      {taken, _left} =
        Enum.reduce_while(lots, {[], quantity}, fn lot, {taken, left} ->
          take = Decimal.min(left, Map.fetch!(on_hand, lot.id))
          left = Decimal.sub(left, take)
          taken = if Decimal.gt?(take, 0), do: [{lot, take} | taken], else: taken
          if Decimal.gt?(left, 0), do: {:cont, {taken, left}}, else: {:halt, {taken, left}}
        end)

      {:ok, Enum.reverse(taken)}
    end
  end

  def allocate(product_id, %Decimal{} = quantity, lot_id) do
    case Repo.get(IngredientLot, lot_id) do
      %IngredientLot{product_id: ^product_id} = lot ->
        on_hand = Map.fetch!(on_hand_by_lot([lot.id]), lot.id)

        if Decimal.gt?(quantity, on_hand),
          do: {:error, :short, on_hand},
          else: {:ok, [{lot, quantity}]}

      _ ->
        {:error, :not_found}
    end
  end

  # Oldest first: received date, then lot id.
  defp product_lots(product_id) do
    from(l in IngredientLot,
      where: l.product_id == ^product_id,
      order_by: [asc: l.received_date, asc: l.id]
    )
    |> Repo.all()
  end

  ## Movements

  @doc """
  Movements newest first (date, then id), for `product_id` (all its lots)
  or `lot_id`. Neither: `{:error, ...}`.
  """
  def list_movements(params) do
    base =
      from(m in Movement,
        join: l in IngredientLot,
        on: l.id == m.lot_id,
        order_by: [desc: m.occurred_on, desc: m.id],
        preload: ^@movement_preloads
      )

    case {blank(params["product_id"]), blank(params["lot_id"])} do
      {nil, nil} ->
        {:error, {:invalid, %{base: ["Give a product_id or a lot_id"]}}}

      {product_id, nil} ->
        {:ok, Repo.all(where(base, [_m, l], l.product_id == ^product_id))}

      {_, lot_id} ->
        {:ok, Repo.all(where(base, [m], m.lot_id == ^lot_id))}
    end
  end

  @doc """
  Record a movement (spec §3.7): `kind`, `quantity_lb` (> 0; the sign comes
  from the kind), `occurred_on`, `note`, `party_id` (a partner brewery, for
  trades and loans only), and `lot_id`, or `product_id` with
  `allocation: "oldest_first"` (outgoing kinds). Counts go through
  `count/3`. `{:ok, movements}`, one per lot touched.
  """
  def create_movement(attrs, user) do
    kind = attrs["kind"]

    with :ok <- movement_kind(kind),
         {:ok, quantity} <- positive(attrs["quantity_lb"]),
         {:ok, date} <- movement_date(attrs["occurred_on"]),
         :ok <- partner(kind, attrs["party_id"]),
         {:ok, target} <- movement_target(kind, attrs) do
      sign = if kind in @outgoing, do: Decimal.negate(quantity), else: quantity

      write(fn ->
        allocation =
          case target do
            {:lot, lot} when kind in @incoming -> {:ok, [{lot, quantity}]}
            {:lot, lot} -> allocate(lot.product_id, quantity, lot.id)
            {:product, product_id} -> allocate(product_id, quantity, :oldest_first)
          end

        case allocation do
          {:ok, parts} ->
            base = %{
              kind: kind,
              occurred_on: date,
              note: attrs["note"],
              partner_party_id: blank(attrs["party_id"]),
              entered_by_id: user.id
            }

            insert_movements!(parts, base, Decimal.negative?(sign))

          {:error, :short, on_hand} ->
            Repo.rollback(short(on_hand, target, Units.quantity_display(user)))
        end
      end)
    end
  end

  @doc """
  A count of a maltster product (spec §3.8) on `counted_on`. `mode:
  "total"` with `counted_lb`: a shortfall comes off the oldest lots first, an
  overage goes onto the newest lot. Expired lots count towards the total
  but a shortfall can't come off them (a 422 when the non-expired stock is
  too small), and an overage goes onto the newest non-expired lot (a 422
  when every lot is expired: count by lot instead). `mode: "by_lot"` with
  `lots: [%{lot_id, counted_lb}]`: one adjustment per lot whose number
  differs. A count that matches on-hand writes a 0 lb count movement
  ("Counted, no change", Matt 2026-11-18): on the newest lot that isn't
  expired for a total, on each lot counted by lot. `{:ok, adjustments}`.
  """
  def count(%Product{} = product, attrs, user) do
    with {:ok, date} <- movement_date(attrs["counted_on"]),
         {:ok, plan} <- count_plan(attrs) do
      base = %{kind: "count", occurred_on: date, note: attrs["note"], entered_by_id: user.id}

      write(fn ->
        product.id
        |> count_parts(plan, Units.quantity_display(user))
        |> Enum.flat_map(fn {parts, negative?} -> insert_movements!(parts, base, negative?) end)
      end)
    end
  end

  defp count_plan(%{"mode" => "total"} = attrs) do
    with {:ok, counted} <- non_negative(attrs["counted_lb"]),
         do: {:ok, {:total, counted}}
  end

  defp count_plan(%{"mode" => "by_lot", "lots" => lots}) when is_list(lots) and lots != [] do
    parsed =
      Enum.map(lots, fn
        %{"lot_id" => id} = entry when is_integer(id) or is_binary(id) ->
          with {:ok, counted} <- non_negative(entry["counted_lb"]),
               do: {:ok, {RockcutApi.Ids.parse(id), counted}}

        _ ->
          {:error, {:invalid, %{lots: ["each needs a lot_id and counted_lb"]}}}
      end)

    case Enum.find(parsed, &match?({:error, _}, &1)) do
      nil ->
        entries = Enum.map(parsed, fn {:ok, e} -> e end)
        ids = Enum.map(entries, &elem(&1, 0))

        if length(Enum.uniq(ids)) == length(ids),
          do: {:ok, {:by_lot, entries}},
          else: {:error, {:invalid, %{lots: ["a lot is listed twice"]}}}

      error ->
        error
    end
  end

  defp count_plan(%{"mode" => "by_lot"}),
    do: {:error, {:invalid, %{lots: ["list each lot with its counted_lb"]}}}

  defp count_plan(_), do: {:error, {:invalid, %{mode: ["must be total or by_lot"]}}}

  # [{[{lot, lb}], negative?}] inside the write transaction.
  defp count_parts(product_id, {:total, counted}, mode) do
    lots = product_lots(product_id)
    on_hand = on_hand_by_lot(Enum.map(lots, & &1.id))
    total = Enum.reduce(Map.values(on_hand), Decimal.new(0), &Decimal.add/2)
    diff = Decimal.sub(counted, total)
    newest = lots |> Enum.reject(&(&1.status == "expired")) |> List.last()

    cond do
      lots == [] ->
        Repo.rollback(refusal("This product has no lots; add a lot first"))

      Decimal.eq?(diff, 0) ->
        [{[{newest || List.last(lots), Decimal.new(0)}], false}]

      Decimal.negative?(diff) ->
        case allocate(product_id, Decimal.negate(diff), :oldest_first) do
          {:ok, parts} ->
            [{parts, true}]

          {:error, :short, usable} ->
            size = shared_sack_size(lots, on_hand)

            Repo.rollback(
              refusal(
                "The count is #{qty(Decimal.negate(diff), size, mode)} under on-hand, more than " <>
                  "the #{qty(usable, size, mode)} in lots that aren't expired; count by lot instead"
              )
            )
        end

      is_nil(newest) ->
        Repo.rollback(refusal("Every lot is expired; count by lot instead"))

      true ->
        [{[{newest, diff}], false}]
    end
  end

  defp count_parts(product_id, {:by_lot, entries}, _mode) do
    lots = Map.new(product_lots(product_id), &{&1.id, &1})

    unless Enum.all?(entries, fn {id, _} -> Map.has_key?(lots, id) end) do
      Repo.rollback({:invalid, %{lots: ["a lot isn't this product's"]}})
    end

    on_hand = on_hand_by_lot(Map.keys(lots))

    changed =
      for {id, counted} <- entries,
          diff = Decimal.sub(counted, Map.fetch!(on_hand, id)),
          not Decimal.eq?(diff, 0) do
        {[{Map.fetch!(lots, id), Decimal.abs(diff)}], Decimal.negative?(diff)}
      end

    # Nothing differs: the check still leaves a trace on each lot counted.
    if changed == [],
      do: [{Enum.map(entries, fn {id, _} -> {Map.fetch!(lots, id), Decimal.new(0)} end), false}],
      else: changed
  end

  defp insert_movements!(parts, base, negative?) do
    movements =
      for {lot, lb} <- parts do
        quantity = if negative?, do: Decimal.negate(lb), else: lb

        %Movement{}
        |> Movement.changeset(Map.merge(base, %{lot_id: lot.id, quantity_lb: quantity}))
        |> Repo.insert!()
      end

    sync_status!(Enum.map(parts, fn {lot, _} -> lot.id end))
    Repo.preload(movements, @movement_preloads)
  end

  @doc """
  Set each lot's status from its on-hand: `depleted` at 0, `available`
  above, an `expired` lot left alone.
  """
  def sync_status!(lot_ids) do
    for {id, on_hand} <- on_hand_by_lot(lot_ids) do
      status = if Decimal.gt?(on_hand, 0), do: "available", else: "depleted"

      from(l in IngredientLot, where: l.id == ^id and l.status != "expired")
      |> Repo.update_all(set: [status: status])
    end

    :ok
  end

  defp movement_kind(kind) when kind in @incoming or kind in @outgoing, do: :ok

  defp movement_kind("count"),
    do: {:error, {:invalid, %{kind: ["Counts are recorded with Count"]}}}

  defp movement_kind(_),
    do:
      {:error, {:invalid, %{kind: ["must be one of #{Enum.join(@incoming ++ @outgoing, ", ")}"]}}}

  # A trade or loan names a partner brewery; nothing else names one.
  defp partner(kind, party_id) when kind in @with_partner do
    case blank(party_id) do
      nil ->
        refuse("Pick the partner brewery for a trade or loan")

      id ->
        if Parties.has_role?(id, "partner_brewery"),
          do: :ok,
          else: refuse("The partner must be a partner brewery")
    end
  end

  defp partner(_kind, party_id) do
    if blank(party_id),
      do: refuse("Only a trade or a loan names a partner brewery"),
      else: :ok
  end

  # {:lot, lot} or {:product, id}. Incoming kinds go onto a lot.
  defp movement_target(kind, attrs) do
    case {blank(attrs["lot_id"]), blank(attrs["product_id"])} do
      {nil, nil} ->
        refuse("Pick a lot, or Oldest first")

      {nil, product_id} when kind in @outgoing ->
        cond do
          attrs["allocation"] != "oldest_first" ->
            {:error, {:invalid, %{allocation: ["must be oldest_first, or pick a lot"]}}}

          not Repo.exists?(from(p in Product, where: p.id == ^product_id)) ->
            {:error, {:invalid, %{product_id: ["does not exist"]}}}

          true ->
            {:ok, {:product, RockcutApi.Ids.parse(product_id)}}
        end

      {nil, _product_id} ->
        refuse("Pick the lot this goes into")

      {lot_id, product_id} ->
        case Repo.get(IngredientLot, lot_id) do
          nil ->
            refuse("That lot doesn't exist")

          %IngredientLot{product_id: nil} ->
            refuse("That lot isn't a lot of a maltster product")

          lot ->
            if product_id && RockcutApi.Ids.parse(product_id) != lot.product_id,
              do: refuse("That lot isn't this product's"),
              else: {:ok, {:lot, lot}}
        end
    end
  end

  defp short(on_hand, {:lot, lot}, mode),
    do:
      refusal(
        "That's more than lot #{lot.lot_number || "##{lot.id}"} has on hand " <>
          "(#{qty(on_hand, lot.sack_size_lb, mode)})"
      )

  defp short(on_hand, {:product, product_id}, mode) do
    lots = product_lots(product_id)
    by_lot = on_hand_by_lot(Enum.map(lots, & &1.id))
    size = shared_sack_size(lots, by_lot)

    expired =
      for(%{status: "expired", id: id} <- lots, do: Map.fetch!(by_lot, id))
      |> Enum.reduce(Decimal.new(0), &Decimal.add/2)

    refusal(
      if Decimal.gt?(expired, 0),
        do:
          "That's more than the #{qty(on_hand, size, mode)} on hand in lots that aren't " <>
            "expired (plus #{qty(expired, size, mode)} in expired lots; pick that lot " <>
            "to use it)",
        else: "That's more than the #{qty(on_hand, size, mode)} on hand"
    )
  end

  # The one sack size a product's stocked lots share (as the UI's
  # `productSackSize`), so a message reads like the dialog; nil when mixed.
  defp shared_sack_size(lots, on_hand) do
    sizes =
      for l <- lots, Decimal.gt?(Map.fetch!(on_hand, l.id), 0), uniq: true, do: l.sack_size_lb

    case sizes do
      [%Decimal{} = size] -> size
      _ -> nil
    end
  end

  defp qty(lb, sack_size, mode), do: Units.format_quantity(lb, sack_size, mode)

  ## Lots

  @doc """
  Lots, newest first, with what the lot JSON shows (`on_hand_lb` and, D61
  §3.4, today's cost and value filled).
  """
  def list_lots(params) do
    IngredientLot
    |> filter(:ingredient_id, params)
    |> filter(:product_id, params)
    |> filter(:status, params)
    |> order_by([l], desc: l.received_date, desc: l.id)
    |> preload(^@lot_preloads)
    |> Repo.all()
    |> put_on_hand()
    |> Valuation.put_values()
  end

  def get_lot!(id) do
    IngredientLot
    |> Repo.get!(id)
    |> Repo.preload(@lot_preloads)
    |> List.wrap()
    |> put_on_hand()
    |> Valuation.put_values()
    |> hd()
  end

  @doc """
  D61 (lead, Stop 1 note 4): the product's lot with this number, trimmed and
  in any case (`w123` is lot `W123`), or nil.
  """
  def find_lot(product_id, number) when is_binary(number) do
    case String.trim(number) do
      "" ->
        nil

      number ->
        from(l in IngredientLot,
          where:
            l.product_id == ^product_id and
              fragment("? = ? COLLATE NOCASE", l.lot_number, ^number),
          order_by: l.id,
          limit: 1
        )
        |> Repo.one()
    end
  end

  def find_lot(_product_id, _number), do: nil

  # A product's lot numbers are unique in any case: "This product already
  # has lot W123" before the index would refuse it; a `base` message so no
  # dialog shows a "lot number:" prefix (lead decisions 1, gap 1).
  defp lot_number_free(attrs, except_id) do
    product_id = RockcutApi.Ids.parse(attrs["product_id"])

    case product_id && find_lot(product_id, attrs["lot_number"]) do
      %IngredientLot{id: id} = lot when id != except_id ->
        {:error, {:invalid, %{base: ["This product already has lot #{lot.lot_number}"]}}}

      _ ->
        :ok
    end
  end

  @doc """
  Add a lot (spec §4.4). A grain lot (its ingredient on Grains or a child)
  needs a maltster product, a received date and its first movement
  (`initial_kind` opening or received, `initial_quantity_lb` > 0); other
  lots may give one. The ingredient comes from the product. The supplier
  must hold the supplier role. The product's standard features are copied
  onto the lot; `features` in the body replace them key by key (nil drops
  one).
  """
  def create_lot(attrs, user) do
    with {:ok, attrs} <- product_ingredient(attrs),
         {:ok, grain?} <- grain_lot?(attrs),
         :ok <- product_rules(attrs, grain?),
         :ok <- supplier(attrs["supplier_party_id"]),
         {:ok, initial} <- initial(attrs, grain?),
         :ok <- lot_number_free(attrs, nil),
         {:ok, features} <- Features.validate(attrs["features"], attrs["ingredient_id"]) do
      write(fn ->
        lot =
          %IngredientLot{}
          |> IngredientLot.changeset(Map.delete(attrs, "status"))
          |> Repo.insert()
          |> rollback_on_error()

        if lot.product_id do
          given = Enum.map(features, fn {type, _} -> type.id end)
          Features.copy_standard!(lot.product_id, lot.id, given)
        end

        Features.write!({:lot, lot.id}, features)

        if initial do
          {kind, quantity} = initial

          insert_movements!(
            [{lot, quantity}],
            %{
              kind: kind,
              occurred_on: lot.received_date || Tasks.today(),
              note: attrs["initial_note"],
              entered_by_id: user.id
            },
            false
          )
        end

        get_lot!(lot.id)
      end)
    end
  end

  @doc """
  Change a lot. `features` change key by key (nil drops one). The status
  may be set to `expired` (or back); otherwise it follows on-hand once the
  lot has movements. The product can't change once the lot has movements,
  nor the sack size once it has movements after its first (lead decisions
  2, gap 14: past movements would read differently).
  """
  def update_lot(%IngredientLot{} = lot, attrs) do
    movements = Repo.aggregate(from(m in Movement, where: m.lot_id == ^lot.id), :count)
    moved? = movements > 0

    new_product =
      Map.has_key?(attrs, "product_id") and
        RockcutApi.Ids.parse(attrs["product_id"]) != lot.product_id

    with :ok <- if(moved? and new_product, do: product_fixed(), else: :ok),
         :ok <- if(movements > 1, do: sack_size_fixed(lot, attrs), else: :ok),
         {:ok, merged} <-
           attrs
           |> Map.put_new("product_id", lot.product_id)
           |> Map.put_new("ingredient_id", lot.ingredient_id)
           |> product_ingredient(),
         ingredient_id = merged["ingredient_id"],
         attrs = Map.put(attrs, "ingredient_id", ingredient_id),
         {:ok, grain?} <- grain_lot?(merged),
         :ok <- product_rules(merged, grain?),
         :ok <- supplier(attrs["supplier_party_id"]),
         :ok <-
           lot_number_free(
             %{"product_id" => merged["product_id"], "lot_number" => attrs["lot_number"]},
             lot.id
           ),
         {:ok, features} <- Features.validate(attrs["features"], ingredient_id) do
      write(fn ->
        lot =
          lot
          |> IngredientLot.changeset(attrs)
          |> Repo.update()
          |> rollback_on_error()

        Features.write!({:lot, lot.id}, features)
        if moved?, do: sync_status!([lot.id])
        get_lot!(lot.id)
      end)
    end
  end

  @doc """
  Delete a lot that has only its first movement (or none) and no recipe
  using it (spec §3.7). Otherwise a 422.
  """
  def delete_lot(%IngredientLot{} = lot) do
    write(fn ->
      case Map.fetch!(delete_blocked([lot.id]), lot.id) do
        nil -> Repo.delete!(lot)
        refusal -> Repo.rollback({:invalid, %{base: [refusal]}})
      end
    end)
  end

  @doc """
  Why each of `lot_ids` can't be deleted, or nil when it can: a recipe uses
  it, or it has movements after its first (two queries).
  """
  def delete_blocked(lot_ids) do
    movements =
      from(m in Movement,
        where: m.lot_id in ^lot_ids,
        group_by: m.lot_id,
        select: {m.lot_id, count(m.id)}
      )
      |> Repo.all()
      |> Map.new()

    used =
      from(ri in RecipeIngredient,
        where: ri.lot_id in ^lot_ids,
        distinct: true,
        select: ri.lot_id
      )
      |> Repo.all()
      |> MapSet.new()

    Map.new(lot_ids, fn id ->
      {id, delete_refusal(MapSet.member?(used, id), Map.get(movements, id, 0))}
    end)
  end

  defp delete_refusal(true, _), do: "A recipe uses this lot, so it can't be deleted"

  defp delete_refusal(false, movements) when movements > 1,
    do: "This lot has movements after its first; correct it with a movement or a count"

  defp delete_refusal(false, _), do: nil

  defp product_fixed,
    do: {:error, {:invalid, %{product_id: ["can't change once the lot has movements"]}}}

  defp sack_size_fixed(lot, attrs) do
    same? =
      case Map.fetch(attrs, "sack_size_lb") do
        :error -> true
        {:ok, given} -> same_decimal?(given, lot.sack_size_lb)
      end

    if same?,
      do: :ok,
      else:
        refuse(
          "This lot has movements after its first, so its sack size can't change " <>
            "(its history would read differently)"
        )
  end

  defp same_decimal?(given, current) when given in [nil, ""], do: is_nil(current)

  defp same_decimal?(given, current) do
    case cast_decimal(given) do
      {:ok, d} -> not is_nil(current) and Decimal.eq?(d, current)
      :error -> false
    end
  end

  # The product decides the ingredient (a lot of "Rahr 2-Row" is 2-Row); an
  # ingredient given with it must be that one.
  defp product_ingredient(attrs) do
    case blank(attrs["product_id"]) do
      nil ->
        {:ok, attrs}

      id ->
        case {Repo.get(Product, id), blank(attrs["ingredient_id"])} do
          {nil, _} ->
            {:error, {:invalid, %{product_id: ["does not exist"]}}}

          {product, nil} ->
            {:ok, Map.put(attrs, "ingredient_id", product.ingredient_id)}

          {product, given} ->
            if RockcutApi.Ids.parse(given) == product.ingredient_id,
              do: {:ok, Map.put(attrs, "ingredient_id", product.ingredient_id)},
              else: {:error, {:invalid, %{ingredient_id: ["isn't this product's grain"]}}}
        end
    end
  end

  # Whether the ingredient is a grain (on Grains or one of its children).
  # An unknown ingredient is left to the changeset.
  defp grain_lot?(attrs) do
    case blank(attrs["ingredient_id"]) do
      nil ->
        {:ok, false}

      id ->
        {:ok,
         Repo.exists?(
           from(i in Ingredient,
             join: c in IngredientCategory,
             on: c.id == i.category_id,
             left_join: p in IngredientCategory,
             on: p.id == c.parent_id,
             where: i.id == ^id and (c.name == "Grains" or p.name == "Grains")
           )
         )}
    end
  end

  # A grain lot needs its maltster product (spec §3.7); `product_ingredient/1`
  # checked that it exists.
  defp product_rules(attrs, true = _grain?) do
    if blank(attrs["product_id"]),
      do: :ok,
      else: {:error, {:invalid, %{product_id: ["A grain lot needs its maltster product"]}}}
  end

  defp product_rules(_attrs, false), do: :ok

  defp supplier(party_id) do
    case blank(party_id) do
      nil ->
        :ok

      id ->
        if Parties.has_role?(id, "supplier"),
          do: :ok,
          else: {:error, {:invalid, %{supplier_party_id: ["must be a supplier"]}}}
    end
  end

  # The first movement: required for a grain lot, with its received date.
  defp initial(attrs, grain?) do
    kind = blank(attrs["initial_kind"])

    cond do
      is_nil(kind) and is_nil(blank(attrs["initial_quantity_lb"])) and not grain? ->
        {:ok, nil}

      kind not in @initial ->
        {:error, {:invalid, %{initial_kind: ["must be opening or received"]}}}

      grain? and is_nil(blank(attrs["received_date"])) ->
        {:error, {:invalid, %{received_date: ["can't be blank"]}}}

      true ->
        with {:ok, quantity} <- positive(attrs["initial_quantity_lb"]),
             :ok <- not_future(attrs["received_date"]),
             do: {:ok, {kind, quantity}}
    end
  end

  ## Helpers

  defp write(fun) do
    Repo.transaction(fun, mode: :immediate)
  end

  defp rollback_on_error({:ok, record}), do: record
  defp rollback_on_error({:error, changeset}), do: Repo.rollback(changeset)

  defp filter(query, field, params) do
    case blank(params[to_string(field)]) do
      nil -> query
      value -> where(query, ^[{field, value}])
    end
  end

  defp blank(v) when v in [nil, ""], do: nil
  defp blank(v), do: v

  defp refusal(message), do: {:invalid, %{base: [message]}}
  defp refuse(message), do: {:error, refusal(message)}

  # A quantity in lb: at least 0.01 and under 1,000,000, kept to 2 decimals.
  defp positive(v) do
    case cast_decimal(v) do
      {:ok, d} ->
        if Decimal.compare(d, Decimal.new("0.01")) != :lt and Decimal.lt?(d, 1_000_000),
          do: {:ok, Units.round(d, 2)},
          else: refuse("Enter a quantity of at least 0.01 lb and under 1,000,000 lb")

      :error ->
        refuse("The quantity must be a number")
    end
  end

  defp non_negative(v) do
    case cast_decimal(v) do
      {:ok, d} ->
        if not Decimal.negative?(d) and Decimal.lt?(d, 1_000_000),
          do: {:ok, Units.round(d, 2)},
          else: refuse("The count must be 0 or more and under 1,000,000 lb")

      :error ->
        refuse("The count must be a number")
    end
  end

  defp cast_decimal(v) when is_binary(v) or is_number(v), do: Ecto.Type.cast(:decimal, v)
  defp cast_decimal(_), do: :error

  # A movement's or count's date: a date, not after today in Colorado
  # (Matt, 2026-11-18, gap 13).
  defp movement_date(v) do
    case Ecto.Type.cast(:date, v) do
      {:ok, %Date{} = d} ->
        if Date.after?(d, Tasks.today()), do: future(), else: {:ok, d}

      _ ->
        refuse("Pick the date")
    end
  end

  # A lot's received date is its first movement's date.
  defp not_future(v) do
    case Ecto.Type.cast(:date, v) do
      {:ok, %Date{} = d} -> if Date.after?(d, Tasks.today()), do: future(), else: :ok
      _ -> :ok
    end
  end

  defp future, do: refuse("The date can't be in the future")
end
