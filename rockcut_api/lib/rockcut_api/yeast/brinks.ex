defmodule RockcutApi.Yeast.Brinks do
  @moduledoc """
  D64 §4.4, §6.3, §6.5: the brinks.

  * Settings (Brewery managers and owners, `Authz` `:yeast_settings`; the
    controller's check): add, rename, empty weight, order, retire / restore,
    and delete. A brink with yeast in it can't be retired ("YB2 still has
    yeast in it"); one with history (any record) can't be deleted, only
    retired.
  * `list/1`: every brink in order with its state for the Brinks tab: empty
    (dirty since when), or its yeast: strains, co-ferment, generation, on
    hand, the count in effect today (and whether it's from before the latest
    harvest), Recount due (an open Count task), the sources and the harvest
    date. A fixed number of queries, however many brinks.
  * `history/1`: a brink's records, newest first, with their entries and
    counts.
  """
  import Ecto.Query

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Ingredients.{Product, Products}
  alias RockcutApi.Production.Batches

  alias RockcutApi.Yeast.{
    BoardTasks,
    Brink,
    Count,
    Counts,
    Entry,
    Harvest,
    HarvestProduct,
    Harvests
  }

  ## Settings

  def get(id), do: Repo.get(Brink, id)

  def create(attrs) do
    attrs = Map.drop(attrs, ["active"])
    %Brink{} |> Brink.changeset(attrs) |> Repo.insert()
  end

  @doc "Change the settings; a new name goes on its open Count and Clean tasks too (gap 12)."
  def update(%Brink{} = brink, attrs, actor) do
    Repo.transaction(
      fn ->
        changeset = Brink.changeset(brink, attrs)

        if Ecto.Changeset.get_change(changeset, :active) == false and
             Harvests.open_record(brink.id) do
          Repo.rollback({:invalid, %{base: ["#{brink.name} still has yeast in it"]}})
        end

        case Repo.update(changeset) do
          {:ok, b} -> tap(b, &BoardTasks.renamed!(brink, &1, actor))
          {:error, cs} -> Repo.rollback(cs)
        end
      end,
      mode: :immediate
    )
  end

  def delete(%Brink{} = brink) do
    if Repo.exists?(from h in Harvest, where: h.brink_id == ^brink.id),
      do:
        {:error,
         {:invalid,
          %{base: ["#{brink.name} has history, so it can't be deleted; retire it instead"]}}},
      else: Repo.delete(brink)
  end

  ## The Brinks tab

  @doc "Every brink (retired ones too, with `all: true`; else active ones), in order, with its state."
  def list(opts \\ []) do
    today = RockcutApi.Tasks.today()

    brinks =
      from(b in Brink, order_by: [b.position, b.name, b.id])
      |> then(fn q -> if opts[:all], do: q, else: where(q, [b], b.active) end)
      |> Repo.all()

    ids = Enum.map(brinks, & &1.id)

    records =
      Repo.all(from h in Harvest, where: h.brink_id in ^ids and h.status == "in_brink")
      |> Map.new(&{&1.brink_id, &1})

    record_ids = records |> Map.values() |> Enum.map(& &1.id)

    entries =
      Repo.all(from e in Entry, where: e.harvest_id in ^record_ids, order_by: e.id)
      |> Enum.group_by(& &1.harvest_id)

    counts =
      Repo.all(
        from c in Count,
          where: c.harvest_id in ^record_ids and c.counted_on <= ^today,
          order_by: [desc: c.counted_on, desc: c.id]
      )
      |> Enum.group_by(& &1.harvest_id)

    strains =
      Repo.all(
        from l in HarvestProduct,
          where: l.harvest_id in ^record_ids,
          order_by: l.product_id,
          select: {l.harvest_id, l.product_id}
      )
      |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))

    with_history =
      Repo.all(from h in Harvest, where: h.brink_id in ^ids, distinct: true, select: h.brink_id)
      |> MapSet.new()

    names =
      product_names(
        entries
        |> Map.values()
        |> List.flatten()
        |> Enum.flat_map(&(&1.product_ids || []))
        |> Kernel.++(strains |> Map.values() |> List.flatten())
      )

    labels = batch_labels(entries |> Map.values() |> List.flatten() |> Enum.map(& &1.batch_id))
    tasks = BoardTasks.open_kinds(ids)

    Enum.map(brinks, fn b ->
      record = records[b.id]
      kinds = Map.get(tasks, b.id, MapSet.new())

      %{
        id: b.id,
        name: b.name,
        empty_weight_lb: b.empty_weight_lb,
        position: b.position,
        active: b.active,
        dirty: b.dirty,
        dirty_since: b.dirty_since,
        has_history: MapSet.member?(with_history, b.id),
        # Gap 4: an empty brink is never due a count.
        recount_due: record != nil and MapSet.member?(kinds, "recount"),
        clean_due: MapSet.member?(kinds, "clean"),
        yeast:
          record &&
            contents(
              record,
              Map.get(entries, record.id, []),
              Map.get(counts, record.id, []),
              Map.get(strains, record.id, []),
              names,
              labels
            )
      }
    end)
  end

  defp contents(record, entries, counts, strain_ids, names, labels) do
    harvests = Enum.filter(entries, &match?(%{kind: "harvested"}, &1))
    last_harvest = harvests |> Enum.map(& &1.occurred_on) |> Enum.max(Date, fn -> nil end)
    count = List.first(counts)

    %{
      harvest_id: record.id,
      lock_version: record.lock_version,
      on_hand_lb: Enum.reduce(entries, Decimal.new(0), &Decimal.add(&1.quantity_lb, &2)),
      generation: record.generation,
      coferment: record.coferment,
      product_ids: strain_ids,
      strains: Enum.map(strain_ids, &names[&1]),
      harvested_on: last_harvest,
      first_harvested_on: harvests |> Enum.map(& &1.occurred_on) |> Enum.min(Date, fn -> nil end),
      sources:
        Enum.map(harvests, fn e ->
          %{
            batch_id: e.batch_id,
            batch: labels[e.batch_id],
            generation: e.generation,
            strains: Enum.map(e.product_ids || [], &names[&1]),
            lb: e.quantity_lb,
            occurred_on: e.occurred_on
          }
        end),
      count:
        count &&
          %{
            id: count.id,
            counted_on: count.counted_on,
            viable_millions_per_ml: count.viable_millions_per_ml,
            viability_pct: count.viability_pct,
            # Decision 18: a count before the latest harvest still applies; the screen says so.
            before_harvest_on:
              if(last_harvest && Date.before?(count.counted_on, last_harvest), do: last_harvest)
          }
    }
  end

  ## History

  @doc "A brink's records, newest first, each with its entries (oldest first) and counts."
  def history(%Brink{} = brink) do
    records =
      Repo.all(
        from h in Harvest,
          where: h.brink_id == ^brink.id,
          order_by: [desc: h.inserted_at, desc: h.id],
          preload: [
            entries: ^from(e in Entry, order_by: e.id, preload: [:entered_by, :device]),
            counts: ^from(c in Count, order_by: [c.counted_on, c.id], preload: :entered_by)
          ]
      )

    entries = Enum.flat_map(records, & &1.entries)
    names = product_names(Enum.flat_map(entries, &(&1.product_ids || [])))
    labels = batch_labels(Enum.map(entries, & &1.batch_id))

    Enum.map(records, fn h ->
      %{
        id: h.id,
        status: h.status,
        generation: h.generation,
        coferment: h.coferment,
        emptied_on: h.emptied_on,
        entries:
          Enum.map(h.entries, fn e ->
            %{
              id: e.id,
              kind: e.kind,
              quantity_lb: e.quantity_lb,
              occurred_on: e.occurred_on,
              batch_id: e.batch_id,
              batch: labels[e.batch_id],
              generation: e.generation,
              strains: Enum.map(e.product_ids || [], &names[&1]),
              note: e.note,
              entered_by: e.entered_by && %{id: e.entered_by.id, name: e.entered_by.name},
              device: e.device && e.device.name,
              step_id: e.production_step_id,
              # Stop 3 (spec §8): what Remove may take out, before who's asking
              # (`Harvests.remove_entry/2` decides; the controller adds `can_remove`).
              removable: removable?(brink, h, e, records)
            }
          end),
        counts:
          Enum.map(h.counts, fn c ->
            %{
              id: c.id,
              counted_on: c.counted_on,
              viable_millions_per_ml: c.viable_millions_per_ml,
              viability_pct: c.viability_pct,
              note: c.note,
              entered_by: c.entered_by && %{id: c.entered_by.id, name: c.entered_by.name},
              # Gap 15: before who's asking, as `removable` above.
              changeable: is_nil(Counts.change_refusal(c, h.entries))
            }
          end)
      }
    end)
  end

  # `Harvests.remove_refusal/2`, the rule Remove itself uses (gap 9).
  defp removable?(brink, %Harvest{} = record, %Entry{} = entry, records) do
    facts = %{
      record: record,
      brink: brink,
      entries: record.entries,
      counts: record.counts,
      newer: Enum.any?(records, &(&1.id > record.id and &1.status != "voided"))
    }

    is_nil(Harvests.remove_refusal(entry, facts))
  end

  # Strain names by product id: the lab's code ("US-05", spec §5.3), else the short name.
  defp product_names(ids) do
    ids = ids |> Enum.reject(&is_nil/1) |> Enum.uniq()

    Repo.all(from p in Product, where: p.id in ^ids, preload: :ingredient)
    |> Map.new(&{&1.id, &1.name || Products.short_name(&1)})
  end

  defp batch_labels(ids) do
    ids = ids |> Enum.reject(&is_nil/1) |> Enum.uniq()

    if ids == [] do
      %{}
    else
      pnums = Batches.p_numbers()

      Repo.all(from b in Batch, where: b.id in ^ids, preload: [:brand, :split_parent])
      |> Map.new(&{&1.id, String.trim(Batches.label(&1, pnums))})
    end
  end
end
