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
  * `unrecord_step/2` (Stop 3, §5.4): un-checking a Yeast harvest step (or
    Undo of its check-off) takes its entry out, refolds the record or voids
    it, and deletes the open Count task unless another harvest still needs
    it. Refused once anything was pitched, dumped, adjusted or counted on
    that record after the entry (`{:yeast_locked, brink}`, 409).
  * `remove_entry/2` (Stop 3, spec §8, A8, lead item 7): Remove on a brink's
    History takes out a mistaken `pitched`, `dumped` or `adjusted` entry
    (its maker or a Brewery manager), only the record's latest entry with
    no count after it; one that closed the record reopens it (unless the
    brink has a newer record), clears the dirty mark and deletes the open
    Clean task. A harvest goes only by un-checking its step, and the
    "Emptied when the … harvest went in" adjustment never goes.
  """
  import Ecto.Query

  alias RockcutApi.{Authz, Repo, Tasks}
  alias RockcutApi.Brewing.Batch
  alias RockcutApi.Ingredients.{Catalog, Product}
  alias RockcutApi.Yeast.{BoardTasks, Brink, Count, Entry, Harvest, HarvestProduct, Rules}

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

  @doc "The day the record's yeast was first harvested (the earliest `harvested` date), or nil."
  def first_harvested_on(record_id) do
    Repo.one(
      from e in Entry,
        where: e.harvest_id == ^record_id and e.kind in ["harvested"],
        select: min(e.occurred_on)
    )
  end

  @doc """
  Lead decisions 5 (gap 3, Matt): the refusal of a pitch or count dated `on`
  before the record's first harvest, or nil. The Pitch, count, Adjust and Dump
  actions ask (the last two: lead decisions 6);
  it isn't a rule of the entries themselves (D63's brew day must never be
  left unrecorded because of a yeast record).
  """
  def before_harvest(brink, record, on) do
    first = first_harvested_on(record.id)

    if first && Date.before?(on, first) do
      {:invalid,
       %{base: ["#{brink.name}'s yeast was harvested #{short(first)}. Pick that day or later."]}}
    end
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
            empty_for_harvest!(brink, open, on, actor)
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
            note: note(attrs["note"]),
            cleared_dirty: brink.dirty,
            cleared_dirty_since: if(brink.dirty, do: brink.dirty_since || on)
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
  # Its Count task goes too (the harvest opens its own), its due day kept on
  # the adjustment (gap 4).
  defp empty_for_harvest!(brink, record, on, actor) do
    left = on_hand(record)
    task = BoardTasks.open_task(brink.id, "recount")

    if Decimal.gt?(left, 0) do
      insert_entry!(
        record,
        %{
          kind: "adjusted",
          quantity_lb: Decimal.negate(left),
          occurred_on: on,
          note: "Emptied when the #{short(on)} harvest went in",
          closed_recount_due_on: task && (task.due_on || on)
        },
        actor
      )
    end

    delete_open_task!(brink, "recount", actor)

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
        if error = before_harvest(brink, record, on), do: Repo.rollback(error)
        left = on_hand(record)

        if Decimal.gt?(lb, left), do: Repo.rollback(has(brink, left))

        entry =
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

        after_draw!(brink, record, entry, Decimal.sub(left, lb), on, actor)
      end)
    end
  end

  @doc "Dump the brink (§6.3): the rest goes; `occurred_on`, `note`, `lock_version`."
  def dump(brink_id, attrs, actor) do
    with {:ok, on} <- date(attrs["occurred_on"]) do
      write(fn ->
        {brink, record} = held!(brink_id, attrs)
        # Lead decisions 6: Dump, dated as Pitch is.
        if error = before_harvest(brink, record, on), do: Repo.rollback(error)
        left = on_hand(record)

        entry =
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

        after_draw!(brink, record, entry, Decimal.new(0), on, actor)
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
        # Lead decisions 6: Adjust weight, dated as Pitch is.
        if error = before_harvest(brink, record, on), do: Repo.rollback(error)
        left = on_hand(record)
        diff = Decimal.sub(weight, left)

        if Decimal.eq?(diff, 0),
          do: Repo.rollback(invalid(:weight_lb, "#{brink.name} has #{lb_text(left)} already"))

        entry =
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

        after_draw!(brink, record, entry, weight, on, actor)
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
  # dirty and its Clean task opens, due that day. Its open Count task goes
  # (an empty brink can't be counted); the closing entry keeps its due day, so
  # removing the entry brings it back (gap 4).
  defp after_draw!(brink, record, entry, left, on, actor) do
    if Decimal.eq?(left, 0) do
      if task = BoardTasks.open_task(brink.id, "recount") do
        entry |> Ecto.Changeset.change(closed_recount_due_on: task.due_on || on) |> Repo.update!()
        delete_open_task!(brink, "recount", actor)
      end

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

  ## Un-check (Stop 3, §5.4)

  @doc """
  Take out the harvest a Yeast harvest step's check-off recorded, inside the
  caller's transaction: `:ok` (nothing recorded is `:ok` too), or
  `{:error, {:yeast_locked, brink}}` once something was pitched, dumped,
  adjusted or counted on the record after the entry. The record refolds
  (a harvest on top goes back to what the brink held), or is voided when it
  has no harvest left. The brink's open Count task is deleted (as `actor`,
  logged on the board) unless a harvest left on the record has had no count
  since.
  """
  def unrecord_step(step_id, actor) do
    case Repo.one(from e in Entry, where: e.production_step_id == ^step_id) do
      nil ->
        :ok

      entry ->
        write(fn ->
          record = Repo.get!(Harvest, entry.harvest_id) |> Repo.preload(:brink)

          if locked?(record, entry), do: Repo.rollback({:yeast_locked, record.brink})

          Repo.delete!(entry)

          record =
            if Repo.exists?(
                 from e in Entry, where: e.harvest_id == ^record.id and e.kind in ["harvested"]
               ) do
              refold!(record)
            else
              # No harvest left: whatever else is on it came before (nothing
              # can come after, `locked?/2`), so the record goes as a whole.
              record
              |> Ecto.Changeset.change(status: "voided", lock_version: record.lock_version + 1)
              |> Repo.update!()
            end

          put_back_dirty!(record, entry)

          unless recount_needed?(record), do: delete_open_task!(record.brink, "recount", actor)
          if record.status == "voided", do: restore_emptied!(record, actor)
          :ok
        end)
        |> case do
          {:ok, :ok} -> :ok
          error -> error
        end
    end
  end

  # Lead decisions 4 (gap 7, Matt): the record "This brink is empty" closed
  # when `voided` began is open again as it was: its adjustment goes, and its
  # Count task comes back if one was due. Closing it and starting the next
  # were one write, and voiding the next reopens it at once, so it's the
  # brink's last record that isn't voided; one that ends any other way than
  # with that adjustment was pitched out, dumped or adjusted to 0.
  defp restore_emptied!(voided, actor) do
    old =
      Repo.one(
        from h in Harvest,
          where: h.brink_id == ^voided.brink_id and h.id < ^voided.id and h.status != "voided",
          order_by: [desc: h.id],
          limit: 1
      )

    last =
      old && old.status == "emptied" &&
        Repo.one(
          from e in Entry, where: e.harvest_id == ^old.id, order_by: [desc: e.id], limit: 1
        )

    if last && last.kind in ["adjusted"] && harvest_emptying?(last) do
      unless voided.brink.active, do: refuse(retired(voided.brink))
      Repo.delete!(last)

      old
      |> Ecto.Changeset.change(
        status: "in_brink",
        emptied_on: nil,
        lock_version: old.lock_version + 1
      )
      |> Repo.update!()

      if due = last.closed_recount_due_on,
        do: BoardTasks.open!(voided.brink, "recount", due, actor)
    end

    :ok
  end

  # Gap 8: what the harvest cleared. With its record voided the brink is as
  # dirty as it was; with other harvests still in it, the first of them
  # carries the mark (the brink was never cleaned under it either).
  defp put_back_dirty!(_record, %Entry{cleared_dirty_since: nil}), do: :ok

  defp put_back_dirty!(%Harvest{status: "voided"} = record, entry) do
    if entry.cleared_dirty do
      record.brink
      |> Ecto.Changeset.change(dirty: true, dirty_since: entry.cleared_dirty_since)
      |> Repo.update!()
    end

    :ok
  end

  defp put_back_dirty!(record, entry) do
    Repo.one!(
      from e in Entry,
        where: e.harvest_id == ^record.id and e.kind in ["harvested"],
        order_by: e.id,
        limit: 1
    )
    |> Ecto.Changeset.change(
      cleared_dirty: entry.cleared_dirty,
      cleared_dirty_since: entry.cleared_dirty_since
    )
    |> Repo.update!()

    :ok
  end

  # Anything but a harvest on the record after `entry`, or a count entered
  # since (a count in the same second counts as since).
  defp locked?(record, entry) do
    Repo.exists?(
      from e in Entry,
        where: e.harvest_id == ^record.id and e.id > ^entry.id and e.kind not in ["harvested"]
    ) or
      Repo.exists?(
        from c in Count,
          where: c.harvest_id == ^record.id and c.inserted_at >= ^entry.inserted_at
      )
  end

  @doc "Whether the open record has a harvest with no count entered since."
  def recount_needed?(%Harvest{status: "in_brink", id: id}) do
    last_count =
      Repo.one(from c in Count, where: c.harvest_id == ^id, select: max(c.inserted_at))

    harvests = from e in Entry, where: e.harvest_id == ^id and e.kind in ["harvested"]

    case last_count do
      nil -> Repo.exists?(harvests)
      at -> Repo.exists?(from e in harvests, where: e.inserted_at > ^at)
    end
  end

  def recount_needed?(_record), do: false

  defp delete_open_task!(brink, kind, actor) do
    case BoardTasks.open_task(brink.id, kind) do
      nil ->
        :ok

      # Not through a person (a direct `Steps.uncomplete/1`): no board event.
      task when is_nil(actor) ->
        Repo.delete!(task)
        :ok

      task ->
        case Tasks.delete_one(task, actor) do
          {:ok, _} -> :ok
          {:error, reason} -> Repo.rollback(reason)
        end
    end
  end

  ## Remove a mistaken entry (Stop 3, spec §8, A8)

  @doc """
  Remove a `pitched`, `dumped` or `adjusted` entry from a brink's History, as
  `actor` (its maker or a Brewery manager, `Authz` `{:yeast_record, _}`).
  Only the latest entry of its record, with no count entered after it. One
  that emptied the record reopens it, which needs the brink to have no newer
  record; the dirty mark it set is cleared and the open Clean task deleted.
  Refusals are `{:conflict, sentence}` (409); `{:ok, record}`.
  """
  def remove_entry(entry_id, actor) do
    write(fn ->
      entry =
        case RockcutApi.Ids.parse(to_string(entry_id)) do
          nil -> Repo.rollback(:not_found)
          id -> Repo.get(Entry, id) || Repo.rollback(:not_found)
        end

      record = Repo.get!(Harvest, entry.harvest_id) |> Repo.preload(:brink)
      brink = record.brink

      unless Authz.can?(actor, :change, {:yeast_record, entry}), do: Repo.rollback(:forbidden)

      if sentence = remove_refusal(entry, removal_facts(record)), do: refuse(sentence)

      Repo.delete!(entry)

      if record.status == "emptied" do
        record =
          record
          |> Ecto.Changeset.change(
            status: "in_brink",
            emptied_on: nil,
            lock_version: record.lock_version + 1
          )
          |> Repo.update!()

        brink |> Ecto.Changeset.change(dirty: false, dirty_since: nil) |> Repo.update!()

        # A Clean task from before this yeast went in (a harvest recorded
        # anyway) is still to do.
        unless Repo.exists?(
                 from e in Entry, where: e.harvest_id == ^record.id and e.cleared_dirty
               ),
               do: delete_open_task!(brink, "clean", actor)

        if due = entry.closed_recount_due_on,
          do: BoardTasks.open!(brink, "recount", due, actor)

        record
      else
        record |> Ecto.Changeset.change(lock_version: record.lock_version + 1) |> Repo.update!()
      end
    end)
  end

  @doc """
  Gap 9: why `entry` can't be removed, or nil: the one rule behind Remove and
  History's `can_remove` (who's asking is `Authz`'s). `facts`: the `record`,
  its `brink`, `entries` and `counts`, and `newer` (the brink has a
  later record that isn't voided).
  """
  def remove_refusal(%Entry{} = entry, %{record: record, brink: brink} = facts) do
    cond do
      entry.kind in ["harvested"] ->
        "A harvest is removed by un-checking its Yeast harvest step."

      entry.kind in ["adjusted"] and harvest_emptying?(entry) ->
        "That adjustment came with a harvest, so it can't be removed."

      record.status == "voided" ->
        "That harvest was un-checked, so its record can't change."

      Enum.any?(facts.entries, &(&1.id > entry.id)) ->
        "Only the latest entry on #{brink.name} can be removed."

      Enum.any?(facts.counts, &(DateTime.compare(&1.inserted_at, entry.inserted_at) != :lt)) ->
        "#{brink.name} has been counted since, so this can't be removed."

      record.status == "emptied" and facts.newer ->
        "#{brink.name} has been filled again since, so this can't be removed."

      # Lead decisions 6: a retired brink holds no yeast, so nothing reopens in it.
      record.status == "emptied" and not brink.active ->
        retired(brink)

      true ->
        nil
    end
  end

  defp retired(brink), do: "#{brink.name} is retired. Restore it first."

  defp removal_facts(record) do
    %{
      record: record,
      brink: record.brink,
      entries: Repo.all(from e in Entry, where: e.harvest_id == ^record.id),
      counts: Repo.all(from c in Count, where: c.harvest_id == ^record.id),
      newer:
        Repo.exists?(
          from h in Harvest,
            where: h.brink_id == ^record.brink_id and h.id > ^record.id and h.status != "voided"
        )
    }
  end

  # "Emptied when the 11/22 harvest went in" (A6): written with a harvest,
  # never by a person.
  defp harvest_emptying?(%Entry{note: note}) when is_binary(note),
    do: Regex.match?(~r|^Emptied when the \d{1,2}/\d{1,2} harvest went in$|, note)

  defp harvest_emptying?(_), do: false

  defp refuse(sentence), do: Repo.rollback({:conflict, sentence})

  ## For the Yeast harvest step's dialog (Stop 3, §5.2)

  @doc """
  The brink a batch's earlier harvest went into, while that brink still
  holds the record (and is active); nil otherwise. The dialog's default for
  a second pull (decision 16).
  """
  def default_brink_id(nil), do: nil

  def default_brink_id(batch_id) do
    Repo.one(
      from e in Entry,
        join: h in assoc(e, :harvest),
        join: b in assoc(h, :brink),
        where:
          e.batch_id == ^batch_id and e.kind in ["harvested"] and h.status == "in_brink" and
            b.active,
        order_by: [desc: e.id],
        limit: 1,
        select: b.id
    )
  end

  @doc "Yeast products for the dialog's strain picker: `%{id, code, label}`, by label."
  def yeast_products do
    yeast = Catalog.category_ids(["yeast"])

    Repo.all(
      from p in Product,
        join: i in assoc(p, :ingredient),
        where: i.category_id in ^yeast and p.active,
        preload: [:manufacturer, ingredient: :category]
    )
    |> Enum.map(fn p ->
      %{
        id: p.id,
        code: p.name || RockcutApi.Ingredients.Products.short_name(p),
        label: RockcutApi.Ingredients.Products.display_name(p)
      }
    end)
    |> Enum.sort_by(&String.downcase(&1.label || ""))
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
      {n, ""} when n > 999 -> {:error, invalid(:generation, "must be 999 or less")}
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
