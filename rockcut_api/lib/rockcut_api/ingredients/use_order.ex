defmodule RockcutApi.Ingredients.UseOrder do
  @moduledoc """
  D63 §4: the order a hop's lots are used in. A **list** is the lots of one
  hop (the ingredient) in one product form, across makers; a lot's place is
  its `use_position`, set on every lot of the Hops category (by key) and null
  on every other lot.

    * A new lot goes to the end, in its own insert (`insert_lot/1`: every
      place a lot is inserted uses it).
    * Receiving, counting and using never move a lot: at 0 it keeps its place.
    * A lot that joins a list some other way (its product, its product's
      ingredient or form, or its ingredient's category changed) goes to the
      end, and one that leaves Hops has no place (`keep/2`).
    * A brewer reorders the lots with stock (`reorder/1`); they trade the
      places they hold, so a used-up lot keeps its own.

  Reads never need the positions to be whole: a lot with none sorts last, by
  received date, then id.
  """
  import Ecto.Query

  alias RockcutApi.{Ids, Repo}
  alias RockcutApi.Brewing.{Ingredient, IngredientLot}
  alias RockcutApi.Ingredients.{Catalog, Inventory, Product}

  @changed "The use order changed since you opened it. This is the order now; move the lot again."

  ## Reading

  @doc """
  A hop's use lists in the forms' order, one per form that has lots:
  `[%{form, version, lots}]`, the lots in use order with their on-hand, maker,
  supplier and features. Used-up lots are in it. [] when it isn't a hop.
  """
  def list(ingredient_id) do
    if Catalog.ingredient_key(ingredient_id) == "hops" do
      ingredient_id
      |> lots_of()
      |> Enum.group_by(&form/1)
      |> Enum.sort_by(fn {form, _} -> form_rank(form) end)
      |> Enum.map(fn {form, lots} -> one(form, sort(lots)) end)
    else
      []
    end
  end

  @doc "The lots of one list in use order, across makers (D68, D66). [] when it isn't a hop."
  def use_order(ingredient_id, form) do
    case Enum.find(list(ingredient_id), &(&1.form == form)) do
      nil -> []
      %{lots: lots} -> lots
    end
  end

  @doc "Lots in use order: by position (none is last), then received date, then id."
  def sort(lots),
    do: Enum.sort_by(lots, &{is_nil(&1.use_position), &1.use_position, received(&1), &1.id})

  # No date is the oldest, as in SQLite.
  defp received(%{received_date: nil}), do: 0
  defp received(%{received_date: date}), do: Date.to_gregorian_days(date)

  defp one(form, lots), do: %{form: form, version: version(lots), lots: lots}

  # The ids, their places, and which are shown: a lot added, moved, used up
  # or back in stock makes it another version.
  defp version(lots) do
    text = Enum.map_join(lots, ",", &"#{&1.id}:#{&1.use_position}:#{shown?(&1)}")
    :sha256 |> :crypto.hash(text) |> Base.encode16(case: :lower) |> binary_part(0, 16)
  end

  # §4.2: the lots a brewer orders: stock above 0, Expired included.
  defp shown?(lot), do: Decimal.gt?(lot.on_hand, 0)

  defp lots_of(ingredient_id) do
    from(l in IngredientLot,
      where: l.ingredient_id == ^ingredient_id,
      preload: [:supplier, product: :manufacturer, feature_values: :feature_type]
    )
    |> Repo.all()
    |> Inventory.put_on_hand()
  end

  defp form(%IngredientLot{product: %Product{form: form}}), do: form
  defp form(_lot), do: nil

  defp form_rank(form),
    do: Enum.find_index(Catalog.forms("hops"), &(&1 == form)) || length(Catalog.forms("hops"))

  ## A lot's place

  @doc """
  Insert a lot (a struct or a changeset) with its place: in Hops the end of
  its list (the highest position + 1), read and written in one transaction;
  none in any other category.
  """
  def insert_lot(lot) do
    changeset = Ecto.Changeset.change(lot)

    {:ok, result} =
      Repo.transaction(
        fn ->
          changeset
          |> put_end()
          |> Repo.insert()
        end,
        mode: :immediate
      )

    result
  end

  def insert_lot!(lot) do
    case insert_lot(lot) do
      {:ok, lot} ->
        lot

      {:error, changeset} ->
        raise Ecto.InvalidChangesetError, action: :insert, changeset: changeset
    end
  end

  defp put_end(%Ecto.Changeset{valid?: false} = changeset), do: changeset

  defp put_end(changeset) do
    ingredient_id = Ecto.Changeset.get_field(changeset, :ingredient_id)
    product_id = Ecto.Changeset.get_field(changeset, :product_id)

    position =
      if Catalog.ingredient_key(ingredient_id) == "hops",
        do: next_position({ingredient_id, product_form(product_id)})

    Ecto.Changeset.put_change(changeset, :use_position, position)
  end

  defp product_form(nil), do: nil
  defp product_form(id), do: Repo.one(from(p in Product, where: p.id == ^id, select: p.form))

  defp next_position({ingredient_id, form}) do
    last =
      from(l in IngredientLot,
        left_join: p in assoc(l, :product),
        where: l.ingredient_id == ^ingredient_id,
        where: coalesce(p.form, "") == ^(form || ""),
        select: max(l.use_position)
      )
      |> Repo.one()

    (last || 0) + 1
  end

  @doc """
  Run `fun`, a write that may move `lot_ids` to another list, inside the
  caller's transaction, and settle their places: a lot now in another list
  goes to its end (the moved ones in the order they had), one no longer a hop
  has none, and one still in its list stays where it is.
  """
  def keep(lot_ids, fun) do
    before = places(lot_ids)
    result = fun.()
    after_ = places(lot_ids)

    moved =
      for {id, {list, _}} <- after_, {was, position} = Map.fetch!(before, id), was != list do
        {id, list, position}
      end

    put_positions!(Enum.map(moved, fn {id, _, _} -> {id, nil} end))

    for {id, list} <- in_order(moved), list != nil do
      put_positions!([{id, next_position(list)}])
    end

    result
  end

  @doc "The ids of the lots of an ingredient, for `keep/2`."
  def lot_ids(%Ingredient{id: id}),
    do: Repo.all(from(l in IngredientLot, where: l.ingredient_id == ^id, select: l.id))

  def lot_ids(%Product{id: id}),
    do: Repo.all(from(l in IngredientLot, where: l.product_id == ^id, select: l.id))

  # id => {its list ({ingredient, form}, nil outside Hops), its position}
  defp places([]), do: %{}

  defp places(lot_ids) do
    from(l in IngredientLot,
      join: i in assoc(l, :ingredient),
      join: c in assoc(i, :category),
      left_join: cp in assoc(c, :parent),
      left_join: p in assoc(l, :product),
      where: l.id in ^lot_ids,
      select: {l.id, coalesce(c.key, cp.key), l.ingredient_id, p.form, l.use_position}
    )
    |> Repo.all()
    |> Map.new(fn {id, key, ingredient_id, form, position} ->
      {id, {if(key == "hops", do: {ingredient_id, form}), position}}
    end)
  end

  # The moved lots in the order they were in; from outside Hops, as the
  # backfill: received date, crop year, id.
  defp in_order(moved) do
    lots =
      from(l in IngredientLot, where: l.id in ^Enum.map(moved, &elem(&1, 0)))
      |> Repo.all()
      |> Map.new(&{&1.id, &1})

    moved
    |> Enum.sort_by(fn {id, _list, position} ->
      lot = Map.fetch!(lots, id)
      {is_nil(position), position, received(lot), lot.crop_year || 0, id}
    end)
    |> Enum.map(fn {id, list, _} -> {id, list} end)
  end

  defp put_positions!(pairs) do
    for {id, position} <- pairs do
      from(l in IngredientLot, where: l.id == ^id)
      |> Repo.update_all(set: [use_position: position])
    end
  end

  ## Reordering

  @doc """
  §4.2: put one list's lots in order. `ingredient_id`, `form`, `lot_ids`
  (every lot with stock, in the new order) and `version` (the list's, as
  read). The shown lots trade the positions they hold. In one `BEGIN
  IMMEDIATE` transaction that checks the version again: a list that changed
  is `{:error, {:conflict, sentence}}` and nothing is written; a lot of
  another list, a repeated or a missing one is `{:error, {:invalid, _}}`.
  `{:ok, list}`, as `list/1` gives it.
  """
  def reorder(attrs) do
    with {:ok, ingredient_id} <- hop(attrs["ingredient_id"]),
         {:ok, form} <- given_form(attrs["form"]),
         {:ok, ids} <- given_ids(attrs["lot_ids"]),
         {:ok, version} <- given_version(attrs["version"]) do
      Repo.transaction(
        fn ->
          lots = read(ingredient_id, form)
          if version(lots) != version, do: Repo.rollback({:conflict, @changed})

          shown = Enum.filter(lots, &shown?/1)
          check_lots!(ids, Enum.map(shown, & &1.id))

          was = positions(lots)
          held = shown |> Enum.map(&was[&1.id]) |> Enum.sort()
          now = Map.merge(was, Map.new(Enum.zip(ids, held)))
          put_positions!(for l <- lots, now[l.id] != l.use_position, do: {l.id, now[l.id]})

          one(form, read(ingredient_id, form))
        end,
        mode: :immediate
      )
    end
  end

  defp read(ingredient_id, form),
    do: ingredient_id |> lots_of() |> Enum.filter(&(form(&1) == form)) |> sort()

  # id => position. A list with a lot that has none, or two that share one,
  # is numbered in its read order first, so a trade always moves something.
  defp positions(lots) do
    given = Enum.map(lots, & &1.use_position)

    if nil in given or Enum.uniq(given) != given,
      do: lots |> Enum.with_index(1) |> Map.new(fn {l, i} -> {l.id, i} end),
      else: Map.new(lots, &{&1.id, &1.use_position})
  end

  defp check_lots!(ids, shown) do
    cond do
      ids -- shown != [] ->
        invalid!("A lot isn't in this use list, or has no stock")

      shown -- ids != [] ->
        invalid!("List every lot with stock")

      true ->
        :ok
    end
  end

  defp invalid!(message), do: Repo.rollback({:invalid, %{lot_ids: [message]}})

  defp hop(id) do
    case Ids.parse(id) do
      id when is_integer(id) ->
        case {Repo.exists?(from(i in Ingredient, where: i.id == ^id)), Catalog.ingredient_key(id)} do
          {false, _} -> {:error, :not_found}
          {true, "hops"} -> {:ok, id}
          _ -> {:error, {:invalid, %{ingredient_id: ["Only hops have a use order"]}}}
        end

      _ ->
        {:error, {:invalid, %{ingredient_id: ["can't be blank"]}}}
    end
  end

  # nil: the lots whose product has no form.
  defp given_form(form) do
    if is_nil(form) or form in Catalog.forms("hops"),
      do: {:ok, form},
      else:
        {:error,
         {:invalid, %{form: ["must be one of #{Enum.join(Catalog.forms("hops"), ", ")}"]}}}
  end

  defp given_ids(ids) when is_list(ids) do
    parsed = Enum.map(ids, &Ids.parse/1)

    cond do
      not Enum.all?(parsed, &is_integer/1) ->
        {:error, {:invalid, %{lot_ids: ["is invalid"]}}}

      Enum.uniq(parsed) != parsed ->
        {:error, {:invalid, %{lot_ids: ["A lot is listed twice"]}}}

      true ->
        {:ok, parsed}
    end
  end

  defp given_ids(_), do: {:error, {:invalid, %{lot_ids: ["can't be blank"]}}}

  defp given_version(version) when is_binary(version) and version != "", do: {:ok, version}
  defp given_version(_), do: {:error, {:invalid, %{version: ["can't be blank"]}}}
end
