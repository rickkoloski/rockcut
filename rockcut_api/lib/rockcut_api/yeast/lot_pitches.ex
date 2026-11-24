defmodule RockcutApi.Yeast.LotPitches do
  @moduledoc """
  D64 lead decisions 3, gap 5 (spec §8, A8): taking back a mistaken pitch of
  purchased yeast, a lot's `used` movement that names its batch. Its maker or
  a Brewery manager (`Authz` `{:yeast_record, _}`); the movement goes, so the
  stock is back on its lot. No other movement is ever deleted.

  A count of the product entered after the pitch blocks it (409): the count
  set the stock from what was there, so the pitch's bricks would be added
  twice. Any lot's count blocks, since a total count writes only the lots it
  changed. Later movements don't: the stock only goes up.
  """
  import Ecto.Query

  alias RockcutApi.{Authz, Repo}
  alias RockcutApi.Brewing.IngredientLot
  alias RockcutApi.Ingredients.{Catalog, Movement, Product}

  @doc "The ids among `movements` that `user` may remove now (one query per product set)."
  def removable_ids(movements, user) do
    pitches = Enum.filter(movements, &(&1.kind in ["used"] and &1.batch_id != nil))
    products = products(Enum.map(pitches, & &1.lot_id))
    counted = last_counts(products |> Map.values() |> Enum.map(& &1.id))

    for m <- pitches,
        product = products[m.lot_id],
        Authz.can?(user, :change, {:yeast_record, m}),
        is_nil(refusal(m, product, counted)),
        into: MapSet.new(),
        do: m.id
  end

  @doc "Remove the pitch. `{:ok, movement}`, or `:not_found`, `:forbidden`, `{:conflict, sentence}`."
  def remove(id, user) do
    Repo.transaction(
      fn ->
        movement =
          case RockcutApi.Ids.parse(to_string(id)) do
            nil -> Repo.rollback(:not_found)
            id -> Repo.get(Movement, id) || Repo.rollback(:not_found)
          end

        product = products([movement.lot_id])[movement.lot_id]

        unless movement.kind in ["used"] and movement.batch_id != nil and product,
          do: Repo.rollback({:conflict, "Only a yeast pitch can be removed."})

        unless Authz.can?(user, :change, {:yeast_record, movement}),
          do: Repo.rollback(:forbidden)

        if sentence = refusal(movement, product, last_counts([product.id])),
          do: Repo.rollback({:conflict, sentence})

        Repo.delete!(movement)
      end,
      mode: :immediate
    )
  end

  defp refusal(movement, product, counted) do
    if (counted[product.id] || 0) > movement.id,
      do: "#{product.name} has been counted since, so this pitch can't be removed."
  end

  # The yeast product of each lot (other lots are left out).
  defp products(lot_ids) do
    yeast = Catalog.category_ids(["yeast"])

    Repo.all(
      from l in IngredientLot,
        join: p in Product,
        on: p.id == l.product_id,
        join: i in assoc(p, :ingredient),
        where: l.id in ^lot_ids and i.category_id in ^yeast,
        select: {l.id, p}
    )
    |> Map.new()
  end

  defp last_counts(product_ids) do
    Repo.all(
      from m in Movement,
        join: l in assoc(m, :lot),
        where: l.product_id in ^product_ids and m.kind in ["count"],
        group_by: l.product_id,
        select: {l.product_id, max(m.id)}
    )
    |> Map.new()
  end
end
