defmodule RockcutApi.Yeast.Counts do
  @moduledoc """
  D64 §4.7, decision 18: cell counts on a brink's record.

  * Add count needs yeast in the brink, a day not in the future, viable
    cells (M/mL, > 0, 1 dp) and viability (%, 0–100, 1 dp); it ticks the
    brink's open Count task when it covers the harvests. Adding, changing and
    deleting all settle the task one way (`settle!/4`).
  * The count in effect on day D is the latest counted on or before D (a tie
    goes to the one entered last). One taken before the latest harvest still
    applies; the screen marks it (`before_harvest`).
  * A count is changed or deleted by its maker or a Brewery manager (and
    owners; `Authz` `{:yeast_record, _}`), until a pitch dated on or after it.
  """
  import Ecto.Query

  alias RockcutApi.{Authz, Repo, Tasks}
  alias RockcutApi.Ingredients.Versions
  alias RockcutApi.Tasks.Task
  alias RockcutApi.Yeast.{BoardTasks, Brink, Count, Entry, Harvest, Harvests}

  @doc "Add a count to the brink's yeast (`brink_id`, `counted_on`, the two values, `note`)."
  def create(attrs, actor) do
    Repo.transaction(
      fn ->
        brink = brink!(attrs["brink_id"])

        record =
          Harvests.open_record(brink.id) ||
            Repo.rollback({:invalid, %{base: ["#{brink.name} is empty"]}})

        count =
          %Count{harvest_id: record.id, entered_by_id: actor.id}
          |> Count.changeset(attrs)
          |> not_before_harvest!(brink, record)
          |> Repo.insert()
          |> ok_or_rollback()

        settle!(%{record | brink: brink}, count, count.id, actor)
        count
      end,
      mode: :immediate
    )
  end

  @doc """
  Change a count (its maker or a Brewery manager; not once a pitch is dated
  on or after it). `lock_version` is the one the dialog opened (gap 23).
  """
  def update(%Count{} = count, attrs, actor) do
    Repo.transaction(
      fn ->
        count = current!(count.id, attrs, actor)
        record = record!(count)

        updated =
          count
          |> Count.changeset(attrs)
          |> not_before_harvest!(record.brink, record)
          |> Versions.bump()
          |> Repo.update()
          |> ok_or_rollback()

        dated_now = if updated.counted_on != count.counted_on, do: updated.id
        settle!(record, updated, dated_now, actor)
        updated
      end,
      mode: :immediate
    )
  end

  @doc """
  Delete a count (`lock_version`), on the same terms as a change. The Count
  task it ticked opens again unless another count covers the harvests (gap 11).
  """
  def delete(%Count{} = count, attrs, actor) do
    Repo.transaction(
      fn ->
        count = current!(count.id, attrs, actor)
        Repo.delete!(count)
        settle!(record!(count), count, nil, actor)
        count
      end,
      mode: :immediate
    )
  end

  # Lead decisions 5 (gap 3): the day, when it's given or changed.
  defp not_before_harvest!(changeset, brink, record) do
    with {:ok, %Date{} = on} <- Ecto.Changeset.fetch_change(changeset, :counted_on),
         {:invalid, _} = error <- Harvests.before_harvest(brink, record, on) do
      Repo.rollback(error)
    else
      _ -> changeset
    end
  end

  # Lead decisions 8 (gap 24): the brink's Count task after any write to a
  # count (`touched`, as it was before a delete). Recount isn't needed: an
  # open Count task is ticked, for a count that covers the harvests; a count
  # that no longer does (or has gone) hands the task it ticked to one that
  # does. Needed, and none open: the task `touched` ticked opens again. One
  # ticked by hand, or before a later Count task, stays. An empty brink: nothing.
  defp settle!(%Harvest{status: "in_brink"} = record, %Count{} = touched, dated_now, actor) do
    covering = Harvests.covering(record, dated_now)
    open = BoardTasks.open_task(record.brink_id, "recount")

    cond do
      Harvests.recount_needed?(record, dated_now) ->
        if is_nil(open), do: reopen!(record, touched, actor)

      open ->
        task = BoardTasks.tick!(record.brink, "recount", actor)
        ticked!(covering, touched, task.id)

      touched.ticked_task_id ->
        ticked!(covering, touched, touched.ticked_task_id)

      true ->
        :ok
    end

    :ok
  end

  defp settle!(_record, _touched, _dated_now, _actor), do: :ok

  # The task's tick is the touched count's if it covers, else the last entered that does.
  defp ticked!(covering, touched, task_id) do
    case Enum.find(covering, &(&1.id == touched.id)) || List.first(covering) do
      nil ->
        :ok

      keeper ->
        Repo.update_all(from(c in Count, where: c.ticked_task_id == ^task_id),
          set: [ticked_task_id: nil]
        )

        Repo.update_all(from(c in Count, where: c.id == ^keeper.id),
          set: [ticked_task_id: task_id]
        )
    end
  end

  defp reopen!(_record, %Count{ticked_task_id: nil}, _actor), do: :ok

  defp reopen!(record, %Count{ticked_task_id: task_id}, actor) do
    task = Repo.get(Task, task_id)

    later? =
      Repo.exists?(
        from t in Task,
          where:
            t.yeast_brink_id == ^record.brink_id and t.yeast_kind == "recount" and t.id > ^task_id
      )

    if task && Task.done?(task) && not later? do
      dept = Repo.get!(RockcutApi.Accounts.Department, task.department_id)

      case Tasks.uncomplete(dept, task, actor) do
        {:ok, _} -> :ok
        {:error, reason} -> Repo.rollback(reason)
      end
    end
  end

  # Lead decisions 8 (gap 23): the count now, when it's the version the
  # dialog opened; another or none is refused (409).
  defp current!(id, attrs, actor) do
    count = Repo.get(Count, id) || Repo.rollback(:not_found)
    unless Authz.can?(actor, :change, {:yeast_record, count}), do: Repo.rollback(:forbidden)
    Versions.check!(count, version(attrs["lock_version"]), "count")

    entries = Repo.all(from e in Entry, where: e.harvest_id == ^count.harvest_id)
    if sentence = change_refusal(count, entries), do: Repo.rollback({:conflict, sentence})
    count
  end

  defp version(v) when is_integer(v), do: v

  defp version(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, ""} -> n
      _ -> nil
    end
  end

  defp version(_), do: nil

  defp record!(%Count{harvest_id: id}), do: Harvest |> Repo.get!(id) |> Repo.preload(:brink)

  def get(id), do: Repo.get(Count, id)

  @doc "The count in effect on `date` for a record (latest `counted_on` ≤ date, then latest id), or nil."
  def in_effect(harvest_id, %Date{} = date) do
    Repo.one(
      from c in Count,
        where: c.harvest_id == ^harvest_id and c.counted_on <= ^date,
        order_by: [desc: c.counted_on, desc: c.id],
        limit: 1
    )
  end

  @doc """
  Why `count` can't be changed or deleted, or nil: the one rule behind both and
  History's `can_change` (lead decisions 7, gap 15; who's asking is `Authz`'s).
  `entries` are its record's.
  """
  def change_refusal(%Count{} = count, entries) do
    entries
    |> Enum.filter(
      &(&1.kind in ["pitched"] and not Date.before?(&1.occurred_on, count.counted_on))
    )
    |> Enum.map(& &1.occurred_on)
    |> Enum.min(Date, fn -> nil end)
    |> case do
      nil ->
        nil

      on ->
        "A pitch on #{Harvests.short(on)} used this count or a later one, so it can't be changed"
    end
  end

  defp brink!(id) do
    with false <- id in [nil, ""],
         id when is_integer(id) <- RockcutApi.Ids.parse(to_string(id)),
         %Brink{} = brink <- Repo.get(Brink, id) do
      brink
    else
      _ -> Repo.rollback({:invalid, %{brink_id: ["Pick the brink"]}})
    end
  end

  defp ok_or_rollback({:ok, v}), do: v
  defp ok_or_rollback({:error, cs}), do: Repo.rollback(cs)
end
