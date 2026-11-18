defmodule RockcutApi.Ingredients.Inventory do
  @moduledoc """
  D60 §3.7–3.8: lots, their stock (the sum of their movements, in lb) and
  the movements and counts that change it.

  Every write that reads stock first runs in one `BEGIN IMMEDIATE`
  transaction (as D32's series writes) and recomputes on-hand inside it, so
  two brewers can't take the same sacks. Outgoing movements and total counts
  share `allocate/3`: oldest lots first by received date, then lot id. A
  movement never takes a lot below 0. A lot's status follows its on-hand
  (`depleted` at 0, `available` above) unless it's `expired`; a lot with no
  movements at all (a non-grain lot, D62's) keeps the status it was given.
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory, IngredientLot, RecipeIngredient}
  alias RockcutApi.Ingredients.{Features, Movement, Parties, Product}

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

  @movement_preloads [:partner, :entered_by, lot: [product: [:maltster, :ingredient]]]

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
    sums =
      from(m in Movement,
        join: l in IngredientLot,
        on: l.id == m.lot_id,
        where: l.product_id in ^product_ids,
        select: {l.product_id, m.quantity_lb}
      )
      |> Repo.all()
      |> sum_by()

    Map.new(product_ids, &{&1, Map.get(sums, &1, Decimal.new(0))})
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

  @doc "Fill each lot's virtual `on_hand_lb` (one query)."
  def put_on_hand(lots) when is_list(lots) do
    on_hand = on_hand_by_lot(Enum.map(lots, & &1.id))
    Enum.map(lots, &%{&1 | on_hand_lb: Map.fetch!(on_hand, &1.id)})
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
  lot id), then the next; a lot id takes it all from that lot, which must be
  the product's. `{:ok, [{lot, lb}]}`, or `{:error, :short, on_hand}` with
  the product's (or that lot's) on-hand. Reads stock as it is now: call it
  inside the write transaction.
  """
  def allocate(product_id, %Decimal{} = quantity, :oldest_first) do
    lots = product_lots(product_id)
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
         {:ok, quantity} <- positive(attrs["quantity_lb"], :quantity_lb),
         {:ok, date} <- date(attrs["occurred_on"], :occurred_on),
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
            Repo.rollback(short(on_hand, target))
        end
      end)
    end
  end

  @doc """
  A count of a maltster product (spec §3.8) on `counted_on`. `mode:
  "total"` with `counted_lb`: a shortfall comes off the oldest lots first, an
  overage goes onto the newest lot. `mode: "by_lot"` with `lots: [%{lot_id,
  counted_lb}]`: one adjustment per lot whose number differs. `{:ok,
  adjustments}` (possibly none).
  """
  def count(%Product{} = product, attrs, user) do
    with {:ok, date} <- date(attrs["counted_on"], :counted_on),
         {:ok, plan} <- count_plan(attrs) do
      base = %{kind: "count", occurred_on: date, note: attrs["note"], entered_by_id: user.id}

      write(fn ->
        product.id
        |> count_parts(plan)
        |> Enum.flat_map(fn {parts, negative?} -> insert_movements!(parts, base, negative?) end)
      end)
    end
  end

  defp count_plan(%{"mode" => "total"} = attrs) do
    with {:ok, counted} <- non_negative(attrs["counted_lb"], :counted_lb),
         do: {:ok, {:total, counted}}
  end

  defp count_plan(%{"mode" => "by_lot", "lots" => lots}) when is_list(lots) and lots != [] do
    parsed =
      Enum.map(lots, fn
        %{"lot_id" => id} = entry when is_integer(id) or is_binary(id) ->
          with {:ok, counted} <- non_negative(entry["counted_lb"], :counted_lb),
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
  defp count_parts(product_id, {:total, counted}) do
    lots = product_lots(product_id)
    on_hand = on_hand_by_lot(Enum.map(lots, & &1.id))
    total = Enum.reduce(Map.values(on_hand), Decimal.new(0), &Decimal.add/2)
    diff = Decimal.sub(counted, total)

    cond do
      Decimal.eq?(diff, 0) ->
        []

      Decimal.negative?(diff) ->
        {:ok, parts} = allocate(product_id, Decimal.negate(diff), :oldest_first)
        [{parts, true}]

      lots == [] ->
        Repo.rollback({:invalid, %{counted_lb: ["This product has no lots; add a lot first"]}})

      true ->
        [{[{List.last(lots), diff}], false}]
    end
  end

  defp count_parts(product_id, {:by_lot, entries}) do
    lots = Map.new(product_lots(product_id), &{&1.id, &1})

    unless Enum.all?(entries, fn {id, _} -> Map.has_key?(lots, id) end) do
      Repo.rollback({:invalid, %{lots: ["a lot isn't this product's"]}})
    end

    on_hand = on_hand_by_lot(Map.keys(lots))

    for {id, counted} <- entries,
        diff = Decimal.sub(counted, Map.fetch!(on_hand, id)),
        not Decimal.eq?(diff, 0) do
      {[{Map.fetch!(lots, id), Decimal.abs(diff)}], Decimal.negative?(diff)}
    end
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
        {:error, {:invalid, %{party_id: ["Pick the partner brewery"]}}}

      id ->
        if Parties.has_role?(id, "partner_brewery"),
          do: :ok,
          else: {:error, {:invalid, %{party_id: ["must be a partner brewery"]}}}
    end
  end

  defp partner(_kind, party_id) do
    if blank(party_id),
      do: {:error, {:invalid, %{party_id: ["is only for trades and loans"]}}},
      else: :ok
  end

  # {:lot, lot} or {:product, id}. Incoming kinds go onto a lot.
  defp movement_target(kind, attrs) do
    case {blank(attrs["lot_id"]), blank(attrs["product_id"])} do
      {nil, nil} ->
        {:error, {:invalid, %{lot_id: ["Pick a lot, or the product with oldest first"]}}}

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
        {:error, {:invalid, %{lot_id: ["Pick the lot this goes into"]}}}

      {lot_id, product_id} ->
        case Repo.get(IngredientLot, lot_id) do
          nil ->
            {:error, {:invalid, %{lot_id: ["does not exist"]}}}

          %IngredientLot{product_id: nil} ->
            {:error, {:invalid, %{lot_id: ["isn't a lot of a maltster product"]}}}

          lot ->
            if product_id && RockcutApi.Ids.parse(product_id) != lot.product_id,
              do: {:error, {:invalid, %{lot_id: ["isn't this product's"]}}},
              else: {:ok, {:lot, lot}}
        end
    end
  end

  defp short(on_hand, {:lot, lot}),
    do:
      {:invalid,
       %{
         quantity_lb: ["is more than lot #{lot.lot_number || lot.id}'s #{lb(on_hand)} lb on hand"]
       }}

  defp short(on_hand, {:product, _}),
    do: {:invalid, %{quantity_lb: ["is more than the #{lb(on_hand)} lb on hand"]}}

  defp lb(d), do: d |> Decimal.normalize() |> Decimal.to_string(:normal)

  ## Lots

  @doc "Lots, newest first, with what the lot JSON shows (`on_hand_lb` filled)."
  def list_lots(params) do
    IngredientLot
    |> filter(:ingredient_id, params)
    |> filter(:product_id, params)
    |> filter(:status, params)
    |> order_by([l], desc: l.received_date, desc: l.id)
    |> preload(^@lot_preloads)
    |> Repo.all()
    |> put_on_hand()
  end

  def get_lot!(id),
    do: IngredientLot |> Repo.get!(id) |> Repo.preload(@lot_preloads) |> put_on_hand()

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
  lot has movements. The product can't change once the lot has movements.
  """
  def update_lot(%IngredientLot{} = lot, attrs) do
    moved? = Repo.exists?(from(m in Movement, where: m.lot_id == ^lot.id))

    new_product =
      Map.has_key?(attrs, "product_id") and
        RockcutApi.Ids.parse(attrs["product_id"]) != lot.product_id

    with :ok <- if(moved? and new_product, do: product_fixed(), else: :ok),
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
      movements = Repo.aggregate(from(m in Movement, where: m.lot_id == ^lot.id), :count)
      used = Repo.exists?(from(ri in RecipeIngredient, where: ri.lot_id == ^lot.id))

      cond do
        used ->
          Repo.rollback({:invalid, %{base: ["A recipe uses this lot, so it can't be deleted"]}})

        movements > 1 ->
          Repo.rollback(
            {:invalid,
             %{
               base: [
                 "This lot has movements after its first; correct it with a movement or a count"
               ]
             }}
          )

        true ->
          Repo.delete!(lot)
      end
    end)
  end

  defp product_fixed,
    do: {:error, {:invalid, %{product_id: ["can't change once the lot has movements"]}}}

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
        with {:ok, quantity} <- positive(attrs["initial_quantity_lb"], :initial_quantity_lb),
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

  defp positive(v, field) do
    case cast_decimal(v) do
      {:ok, d} ->
        if Decimal.gt?(d, 0) and Decimal.lt?(d, 1_000_000),
          do: {:ok, d},
          else: {:error, {:invalid, %{field => ["must be more than 0 and under 1,000,000"]}}}

      :error ->
        {:error, {:invalid, %{field => ["must be a number"]}}}
    end
  end

  defp non_negative(v, field) do
    case cast_decimal(v) do
      {:ok, d} ->
        if not Decimal.negative?(d) and Decimal.lt?(d, 1_000_000),
          do: {:ok, d},
          else: {:error, {:invalid, %{field => ["must be 0 or more and under 1,000,000"]}}}

      :error ->
        {:error, {:invalid, %{field => ["must be a number"]}}}
    end
  end

  defp cast_decimal(v) when is_binary(v) or is_number(v), do: Ecto.Type.cast(:decimal, v)
  defp cast_decimal(_), do: :error

  defp date(v, field) do
    case Ecto.Type.cast(:date, v) do
      {:ok, %Date{} = d} -> {:ok, d}
      _ -> {:error, {:invalid, %{field => ["must be a date"]}}}
    end
  end
end
