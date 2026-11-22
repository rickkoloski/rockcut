defmodule RockcutApi.Yeast.Harvests do
  @moduledoc """
  D64 §4.5, §5.2, §6.3–§6.4: the yeast in a brink and every write to it.

  Every write runs in one `BEGIN IMMEDIATE` transaction (D60's pattern), reads
  the brink's open record inside it, never takes on hand below 0 ("YB2 has
  18 lb", 422) and bumps the record's `lock_version`; a write sent with the
  version it opened is refused (409) when someone else has written since.

  * `harvest/2`: a harvest into a brink (Stop 3 calls it from the Yeast
    harvest step; nothing else does). A dirty brink asks first
    (`{:yeast_question, :dirty, brink}`; `dirty_ok` records anyway and clears
    the mark), then a brink with yeast in it (`{:yeast_question, :has_yeast,
    brink}`; `brink_answer` `on_top` adds to the record, `empty` closes it
    with an `adjusted` entry to 0, "Emptied when the 11/22 harvest went in",
    with no dirty mark and no Clean task). The record's strains and
    generation are refolded (`Rules.fold/1`), and the brink's Count task is
    opened, due the harvest day.
  * `pitch/3`, `dump/3`, `adjust/3`: draw down, empty, or set the weight.
    Reaching 0 closes the record (`emptied`, `emptied_on`), marks the brink
    dirty and opens its Clean task, due that day.
  * `clean/2`: Mark clean (a dirty brink only): clears the mark and ticks
    the open Clean task.
  """
  import Ecto.Query

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Ingredients.{Catalog, Product}
  alias RockcutApi.Yeast.{BoardTasks, Brink, Entry, Harvest, HarvestProduct, Rules}

  @max_lb Decimal.new(10_000)

  ## Reads

  @doc "The brink's open (`in_brink`) record, or nil."
  def open_record(brink_id) do
    Repo.one(from h in Harvest, where: h.brink_id == ^brink_id and h.status == "in_brink")
  end

  @doc "On hand of a record: the sum of its entries, in lb."
  def on_hand(%Harvest{id: id}), do: on_hand(id)

  def on_hand(id) when is_integer(id) do
    Repo.one(from e in Entry, where: e.harvest_id == ^id, select: sum(e.quantity_lb)) ||
      Decimal.new(0)
  end

  @doc "A record's strains (product ids, in order)."
  def product_ids(harvest_id) do
    Repo.all(
      from l in HarvestProduct,
        where: l.harvest_id == ^harvest_id,
        order_by: l.product_id,
        select: l.product_id
    )
  end

  ## Harvest

  @doc """
  Harvest into a brink. `attrs` (flat): `brink_id`, `lb` (> 0, 2 dp),
  `occurred_on` (not in the future), `batch_id` (the source batch),
  `product_ids` (yeast products) and `generation` (1 or more), `note`,
  `production_step_id` (Stop 3), `dirty_ok`, `brink_answer`
  (`on_top` / `empty`). `{:ok, record}`, `{:error, {:yeast_question, kind,
  brink}}`, or the 422.
  """
  def harvest(attrs, actor) do
    with {:ok, lb} <- lb(attrs["lb"]),
         {:ok, on} <- date(attrs["occurred_on"]),
         {:ok, batch_id} <- batch(attrs["batch_id"]),
         {:ok, ids} <- strains(attrs["product_ids"]),
         {:ok, generation} <- generation(attrs["generation"]) do
      write(fn ->
        brink = active_brink!(attrs["brink_id"])
        open = open_record(brink.id)

        cond do
          brink.dirty and not truthy?(attrs["dirty_ok"]) ->
            Repo.rollback({:yeast_question, :dirty, brink})

          open && attrs["brink_answer"] not in ["on_top", "empty"] ->
            Repo.rollback({:yeast_question, :has_yeast, brink})

          true ->
            :ok
        end

        if brink.dirty do
          brink |> Ecto.Changeset.change(dirty: false, dirty_since: nil) |> Repo.update!()
        end

        open =
          if open && attrs["brink_answer"] == "empty" do
            empty_for_harvest!(open, on, actor)
            nil
          else
            open
          end

        record = open || Repo.insert!(%Harvest{brink_id: brink.id, status: "in_brink"})

        insert_entry!(
          record,
          %{
            kind: "harvested",
            quantity_lb: lb,
            occurred_on: on,
            batch_id: batch_id,
            production_step_id: attrs["production_step_id"],
            product_ids: ids,
            generation: generation,
            note: note(attrs["note"])
          },
          actor
        )

        record = refold!(record)
        BoardTasks.open!(brink, "recount", on, actor)
        record
      end)
    end
  end

  # "This brink is empty" (A6): the old record closes at 0 with the note; no
  # dirty mark and no Clean task, since the brink is being filled now.
  defp empty_for_harvest!(record, on, actor) do
    left = on_hand(record)

    if Decimal.gt?(left, 0) do
      insert_entry!(
        record,
        %{
          kind: "adjusted",
          quantity_lb: Decimal.negate(left),
          occurred_on: on,
          note: "Emptied when the #{short(on)} harvest went in"
        },
        actor
      )
    end

    record
    |> Ecto.Changeset.change(
      status: "emptied",
      emptied_on: on,
      lock_version: record.lock_version + 1
    )
    |> Repo.update!()
  end

  @doc """
  The record's strains and generation from its `harvested` entries
  (`Rules.fold/1`), rewritten; bumps `lock_version`.
  """
  def refold!(%Harvest{} = record) do
    entries = Repo.all(from e in Entry, where: e.harvest_id == ^record.id)

    case Rules.fold(entries) do
      nil ->
        record

      state ->
        Repo.delete_all(from l in HarvestProduct, where: l.harvest_id == ^record.id)

        Repo.insert_all(
          HarvestProduct,
          Enum.map(state.product_ids, &%{harvest_id: record.id, product_id: &1})
        )

        record
        |> Ecto.Changeset.change(
          generation: state.generation,
          coferment: state.coferment,
          lock_version: record.lock_version + 1
        )
        |> Repo.update!()
    end
  end

  ## Stock actions

  @doc """
  Pitch from a brink into a batch (§6.4): `lb` (> 0, ≤ on hand), `batch_id`,
  `occurred_on` (not in the future), `note`, `lock_version` (optional).
  The entry keeps the strains and generation the record has now.
  """
  def pitch(brink_id, attrs, actor) do
    with {:ok, lb} <- lb(attrs["lb"]),
         {:ok, on} <- date(attrs["occurred_on"]),
         {:ok, batch_id} <- batch(attrs["batch_id"]) do
      write(fn ->
        {brink, record} = held!(brink_id, attrs)
        left = on_hand(record)

        if Decimal.gt?(lb, left), do: Repo.rollback(has(brink, left))

        insert_entry!(
          record,
          %{
            kind: "pitched",
            quantity_lb: Decimal.negate(lb),
            occurred_on: on,
            batch_id: batch_id,
            product_ids: product_ids(record.id),
            generation: record.generation,
            note: note(attrs["note"])
          },
          actor
        )

        after_draw!(brink, record, Decimal.sub(left, lb), on, actor)
      end)
    end
  end

  @doc "Dump the brink (§6.3): the rest goes; `occurred_on`, `note`, `lock_version`."
  def dump(brink_id, attrs, actor) do
    with {:ok, on} <- date(attrs["occurred_on"]) do
      write(fn ->
        {brink, record} = held!(brink_id, attrs)
        left = on_hand(record)

        insert_entry!(
          record,
          %{
            kind: "dumped",
            quantity_lb: Decimal.negate(left),
            occurred_on: on,
            note: note(attrs["note"])
          },
          actor
        )

        after_draw!(brink, record, Decimal.new(0), on, actor)
      end)
    end
  end

  @doc """
  Adjust weight (§6.3): `weight_lb` is the yeast weight now (≥ 0, 2 dp; the
  brink's empty weight isn't subtracted, decision 8); `occurred_on`, `note`,
  `lock_version`. 0 empties it as a dump does.
  """
  def adjust(brink_id, attrs, actor) do
    with {:ok, weight} <- weight(attrs["weight_lb"]),
         {:ok, on} <- date(attrs["occurred_on"]) do
      write(fn ->
        {brink, record} = held!(brink_id, attrs)
        left = on_hand(record)
        diff = Decimal.sub(weight, left)

        if Decimal.eq?(diff, 0),
          do: Repo.rollback(invalid(:weight_lb, "#{brink.name} has #{lb_text(left)} already"))

        insert_entry!(
          record,
          %{
            kind: "adjusted",
            quantity_lb: diff,
            occurred_on: on,
            note: note(attrs["note"])
          },
          actor
        )

        after_draw!(brink, record, weight, on, actor)
      end)
    end
  end

  @doc "Mark clean (§6.3): a dirty brink only; clears the mark and ticks its open Clean task."
  def clean(brink_id, actor) do
    write(fn ->
      brink = brink!(brink_id)

      unless brink.dirty,
        do: Repo.rollback({:invalid, %{base: ["#{brink.name} isn't marked dirty"]}})

      brink = brink |> Ecto.Changeset.change(dirty: false, dirty_since: nil) |> Repo.update!()
      BoardTasks.tick!(brink, "clean", actor)
      brink
    end)
  end

  # After a draw: bump the version; at 0 the record closes, the brink is
  # dirty and its Clean task opens, due that day.
  defp after_draw!(brink, record, left, on, actor) do
    if Decimal.eq?(left, 0) do
      record =
        record
        |> Ecto.Changeset.change(
          status: "emptied",
          emptied_on: on,
          lock_version: record.lock_version + 1
        )
        |> Repo.update!()

      brink |> Ecto.Changeset.change(dirty: true, dirty_since: on) |> Repo.update!()
      BoardTasks.open!(brink, "clean", on, actor)
      record
    else
      record |> Ecto.Changeset.change(lock_version: record.lock_version + 1) |> Repo.update!()
    end
  end

  # The brink and its open record (none: "YB2 is empty"), the version checked.
  defp held!(brink_id, attrs) do
    brink = brink!(brink_id)

    record =
      open_record(brink.id) || Repo.rollback({:invalid, %{base: ["#{brink.name} is empty"]}})

    case version(attrs["lock_version"]) do
      nil ->
        :ok

      v when v == record.lock_version ->
        :ok

      _ ->
        Repo.rollback(
          {:conflict,
           "#{brink.name} changed since you opened it (someone pitched, counted or adjusted it). Close and try again."}
        )
    end

    {brink, record}
  end

  defp brink!(id) do
    case RockcutApi.Ids.parse(to_string(id)) do
      nil -> Repo.rollback(:not_found)
      id -> Repo.get(Brink, id) || Repo.rollback(:not_found)
    end
  end

  defp active_brink!(id) do
    if id in [nil, ""], do: Repo.rollback({:invalid, %{brink_id: ["Pick the brink"]}})
    brink = brink!(id)

    unless brink.active,
      do: Repo.rollback({:invalid, %{brink_id: ["#{brink.name} is retired"]}})

    brink
  end

  defp insert_entry!(record, attrs, actor) do
    Repo.insert!(
      struct(
        Entry,
        Map.merge(attrs, %{
          harvest_id: record.id,
          entered_by_id: actor.id,
          device_id: actor.on_device_id
        })
      )
    )
  end

  ## Input

  defp write(fun) do
    case Repo.transaction(fun, mode: :immediate) do
      {:ok, result} -> {:ok, result}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc false
  def has(brink, left), do: {:invalid, %{base: ["#{brink.name} has #{lb_text(left)}"]}}

  @doc ~S|"18 lb", "42.5 lb".|
  def lb_text(d), do: "#{d |> Decimal.normalize() |> Decimal.to_string(:normal)} lb"

  @doc ~S|"11/22"|
  def short(%Date{month: m, day: d}), do: "#{m}/#{d}"

  defp lb(v) do
    case decimal(v) do
      {:ok, d} ->
        cond do
          not Decimal.gt?(d, 0) ->
            {:error, invalid(:lb, "Enter more than 0 lb")}

          Decimal.gt?(d, @max_lb) ->
            {:error, invalid(:lb, "At most 10,000 lb")}

          not Decimal.eq?(Decimal.round(d, 2), d) ->
            {:error, invalid(:lb, "Use at most 2 decimals")}

          true ->
            {:ok, d}
        end

      :error ->
        {:error, invalid(:lb, "Enter the weight in lb")}
    end
  end

  defp weight(v) do
    case decimal(v) do
      {:ok, d} ->
        cond do
          Decimal.negative?(d) ->
            {:error, invalid(:weight_lb, "Enter 0 or more")}

          Decimal.gt?(d, @max_lb) ->
            {:error, invalid(:weight_lb, "At most 10,000 lb")}

          not Decimal.eq?(Decimal.round(d, 2), d) ->
            {:error, invalid(:weight_lb, "Use at most 2 decimals")}

          true ->
            {:ok, d}
        end

      :error ->
        {:error, invalid(:weight_lb, "Enter the yeast weight now in lb")}
    end
  end

  @doc false
  def date(v) do
    case Ecto.Type.cast(:date, v) do
      {:ok, %Date{} = d} ->
        if Date.after?(d, Tasks.today()),
          do: {:error, {:invalid, %{base: ["The date can't be in the future"]}}},
          else: {:ok, d}

      _ ->
        {:error, invalid(:occurred_on, "Pick the date")}
    end
  end

  @doc false
  def batch(id) do
    case id do
      blank when blank in [nil, ""] ->
        {:error, invalid(:batch_id, "Pick the batch")}

      id ->
        case RockcutApi.Ids.parse(to_string(id)) do
          nil ->
            {:error, invalid(:batch_id, "does not exist")}

          id ->
            if Repo.exists?(from b in Batch, where: b.id == ^id),
              do: {:ok, id},
              else: {:error, invalid(:batch_id, "does not exist")}
        end
    end
  end

  defp strains(ids) when is_list(ids) and ids != [] do
    parsed = Enum.map(ids, &RockcutApi.Ids.parse(to_string(&1)))
    yeast = Catalog.category_ids(["yeast"])

    found =
      Repo.all(
        from p in Product,
          join: i in assoc(p, :ingredient),
          where: p.id in ^Enum.reject(parsed, &is_nil/1) and i.category_id in ^yeast,
          select: p.id
      )

    if Enum.all?(parsed, &(&1 in found)),
      do: {:ok, parsed |> Enum.uniq() |> Enum.sort()},
      else: {:error, invalid(:product_ids, "must be yeast products")}
  end

  defp strains(_), do: {:error, invalid(:product_ids, "Pick the strain")}

  defp generation(v) do
    case Integer.parse(to_string(v || "")) do
      {n, ""} when n >= 1 and n <= 999 -> {:ok, n}
      _ -> {:error, invalid(:generation, "must be 1 or more")}
    end
  end

  defp version(v) when v in [nil, ""], do: nil

  defp version(v) do
    case Integer.parse(to_string(v)) do
      {n, ""} -> n
      _ -> -1
    end
  end

  defp decimal(v) when is_binary(v) or is_number(v) do
    case Ecto.Type.cast(:decimal, v) do
      {:ok, d} -> {:ok, d}
      :error -> :error
    end
  end

  defp decimal(_), do: :error

  defp note(v) when v in [nil, ""], do: nil
  defp note(v) when is_binary(v), do: v |> String.trim() |> String.slice(0, 2_000)
  defp note(_), do: nil

  defp truthy?(v), do: v in [true, "true", "1", 1]

  defp invalid(field, message), do: {:invalid, %{field => [message]}}
end
