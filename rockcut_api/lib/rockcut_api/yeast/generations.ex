defmodule RockcutApi.Yeast.Generations do
  @moduledoc """
  D64 §5.3, §6.6: what went into a batch and what came out of it.

  * `for_batch/1`: the Harvest dialog's defaults (strains and generation)
    from what was pitched into the batch. A pitch of purchased yeast (a lot's
    `used` movement naming the batch, Stop 1) is that product's Mother,
    generation 0; a pitch from a brink (a `pitched` entry) carries the
    strains and generation its record had then (its snapshot). The sources
    go through `Rules.from_sources/1`; none (an older batch, or one pitched
    before D64) is nil, and the dialog asks (A5).
  * `defaults/1`: `for_batch/1`, else the batch's earlier pull (a second
    pull from a batch with no recorded pitch isn't asked again).
  * `batch_page/1`: the batch page's Yeast section (spec §6.6): the pitches
    (lots and brinks) and the harvests (one line per pull, "(on top)" when
    the pull went onto yeast already in the brink), plus a Yeast dumped
    check-off with its note.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Ingredients.{Catalog, Movement, Product, Products}
  alias RockcutApi.Production.Step
  alias RockcutApi.Yeast.{Entry, Harvest, Rules}

  @doc "The defaults `Rules.from_sources/1` gives a harvest of `batch_id`; nil with no pitches."
  def for_batch(nil), do: nil

  def for_batch(batch_id) do
    lots =
      for {product_id, _} <- lot_pitches(batch_id),
          uniq: true,
          do: %{product_ids: [product_id], generation: 0}

    brinks =
      for e <- brink_pitches(batch_id),
          do: %{product_ids: e.product_ids || [], generation: e.generation || 0}

    Rules.from_sources(lots ++ brinks)
  end

  @doc """
  The Harvest dialog's defaults for a pull from `batch_id`: `for_batch/1`,
  else (nothing recorded as pitched) what the batch's earlier pull was
  recorded as, so a second pull isn't asked again; nil when neither.
  """
  def defaults(nil), do: nil

  def defaults(batch_id) do
    for_batch(batch_id) ||
      case Repo.one(
             from e in Entry,
               where: e.batch_id == ^batch_id and e.kind in ["harvested"],
               order_by: [desc: e.id],
               limit: 1
           ) do
        nil ->
          nil

        e ->
          ids = Enum.sort(e.product_ids || [])
          %{product_ids: ids, generation: e.generation, coferment: length(ids) > 1}
      end
  end

  # `[{product_id, movement}]`: a yeast lot's `used` movements naming the batch.
  defp lot_pitches(batch_id) do
    yeast = Catalog.category_ids(["yeast"])

    Repo.all(
      from m in Movement,
        join: l in assoc(m, :lot),
        join: p in Product,
        on: p.id == l.product_id,
        join: i in assoc(p, :ingredient),
        where: m.batch_id == ^batch_id and m.kind in ["used"] and i.category_id in ^yeast,
        order_by: [m.occurred_on, m.id],
        select: {p.id, m}
    )
  end

  defp brink_pitches(batch_id) do
    Repo.all(
      from e in Entry,
        where: e.batch_id == ^batch_id and e.kind in ["pitched"],
        order_by: [e.occurred_on, e.id]
    )
  end

  @doc """
  The batch page's Yeast section: `%{pitched, harvested, dumped}`. Pitched:
  `%{source: "lot", quantity, unit, product, lot_number, occurred_on}` or
  `%{source: "brink", lb, brink, strains, generation, coferment,
  occurred_on}`. Harvested: `%{lb, brink, occurred_on, on_top, strains,
  generation, note}`, one per pull in order. Dumped: `%{done_on, note}`.
  """
  def batch_page(batch_id) do
    lot_rows = lot_pitches(batch_id)
    brink_rows = brink_pitches(batch_id)

    harvests =
      Repo.all(
        from e in Entry,
          where: e.batch_id == ^batch_id and e.kind in ["harvested"],
          order_by: [e.occurred_on, e.id],
          preload: [harvest: :brink]
      )

    products =
      lot_rows
      |> Enum.map(&elem(&1, 0))
      |> Kernel.++(Enum.flat_map(brink_rows ++ harvests, &(&1.product_ids || [])))
      |> products()

    lots = lot_numbers(Enum.map(lot_rows, fn {_, m} -> m.lot_id end))
    brink_names = brink_names(Enum.map(brink_rows, & &1.harvest_id))

    pitched =
      Enum.map(lot_rows, fn {product_id, m} ->
        p = products[product_id]

        %{
          source: "lot",
          occurred_on: m.occurred_on,
          quantity: Decimal.abs(m.quantity),
          unit: p && Products.unit_label(p),
          product: p && Products.short_name(p),
          lot_number: lots[m.lot_id],
          note: m.note
        }
      end) ++
        Enum.map(brink_rows, fn e ->
          %{
            source: "brink",
            occurred_on: e.occurred_on,
            lb: Decimal.abs(e.quantity_lb),
            brink: brink_names[e.harvest_id],
            strains: codes(e.product_ids, products),
            generation: e.generation,
            coferment: length(e.product_ids || []) > 1,
            note: e.note
          }
        end)

    harvested =
      Enum.map(harvests, fn e ->
        %{
          entry_id: e.id,
          occurred_on: e.occurred_on,
          lb: e.quantity_lb,
          brink: e.harvest.brink.name,
          on_top: on_top?(e),
          strains: codes(e.product_ids, products),
          generation: e.generation,
          note: e.note
        }
      end)

    dumped =
      Repo.all(
        from s in Step,
          where: s.batch_id == ^batch_id and s.yeast_outcome == "dumped",
          order_by: [s.done_on, s.id],
          select: %{done_on: s.done_on, note: s.yeast_note}
      )

    %{
      pitched: Enum.sort_by(pitched, & &1.occurred_on, Date),
      harvested: harvested,
      dumped: dumped
    }
  end

  # A pull that went onto yeast already in its record (an earlier entry).
  defp on_top?(%Entry{id: id, harvest_id: harvest_id}),
    do: Repo.exists?(from e in Entry, where: e.harvest_id == ^harvest_id and e.id < ^id)

  defp products(ids) do
    ids = ids |> Enum.reject(&is_nil/1) |> Enum.uniq()

    Repo.all(from p in Product, where: p.id in ^ids, preload: [ingredient: :category])
    |> Map.new(&{&1.id, &1})
  end

  # The lab's code ("US-05"), as the Brinks tab names a strain.
  defp codes(ids, products),
    do: Enum.map(ids || [], fn id -> (p = products[id]) && (p.name || Products.short_name(p)) end)

  defp lot_numbers(ids) do
    ids = Enum.uniq(ids)

    Repo.all(
      from l in RockcutApi.Brewing.IngredientLot,
        where: l.id in ^ids,
        select: {l.id, l.lot_number}
    )
    |> Map.new()
  end

  defp brink_names(harvest_ids) do
    ids = Enum.uniq(harvest_ids)

    Repo.all(
      from h in Harvest, join: b in assoc(h, :brink), where: h.id in ^ids, select: {h.id, b.name}
    )
    |> Map.new()
  end
end
