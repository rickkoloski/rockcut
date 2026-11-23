defmodule RockcutApi.Yeast.Counts do
  @moduledoc """
  D64 §4.7, decision 18: cell counts on a brink's record.

  * Add count needs yeast in the brink, a day not in the future, viable
    cells (M/mL, > 0, 1 dp) and viability (%, 0–100, 1 dp); it ticks the
    brink's open Count task.
  * The count in effect on day D is the latest counted on or before D (a tie
    goes to the one entered last). One taken before the latest harvest still
    applies; the screen marks it (`before_harvest`).
  * A count is changed or deleted by its maker or a Brewery manager (and
    owners; `Authz` `{:yeast_record, _}`), until a pitch dated on or after it.
  """
  import Ecto.Query

  alias RockcutApi.{Authz, Repo, Tasks}
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

        case BoardTasks.tick!(brink, "recount", actor) do
          nil -> count
          task -> count |> Ecto.Changeset.change(ticked_task_id: task.id) |> Repo.update!()
        end
      end,
      mode: :immediate
    )
  end

  @doc "Change a count (its maker or a Brewery manager; not once a pitch is dated on or after it)."
  def update(%Count{} = count, attrs, actor) do
    Repo.transaction(
      fn ->
        changeable!(count, actor)
        record = Repo.get!(Harvest, count.harvest_id) |> Repo.preload(:brink)

        count
        |> Count.changeset(attrs)
        |> not_before_harvest!(record.brink, record)
        |> Repo.update()
        |> ok_or_rollback()
      end,
      mode: :immediate
    )
  end

  @doc """
  Delete a count, on the same terms as a change. The Count task it ticked
  opens again unless another count follows the latest harvest (gap 11).
  """
  def delete(%Count{} = count, actor) do
    Repo.transaction(
      fn ->
        changeable!(count, actor)
        Repo.delete!(count)
        reopen_task!(count, actor)
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

  # Another count still covers the harvest: it answers for the task now.
  defp reopen_task!(%Count{ticked_task_id: nil}, _actor), do: :ok

  defp reopen_task!(%Count{ticked_task_id: task_id, harvest_id: harvest_id}, actor) do
    record = Repo.get!(Harvest, harvest_id)
    task = Repo.get(Task, task_id)

    cond do
      is_nil(task) or not Task.done?(task) or record.status != "in_brink" ->
        :ok

      not Harvests.recount_needed?(record) ->
        Repo.one!(
          from c in Count,
            where: c.harvest_id == ^harvest_id,
            order_by: [desc: c.inserted_at, desc: c.id],
            limit: 1
        )
        |> Ecto.Changeset.change(ticked_task_id: task_id)
        |> Repo.update!()

        :ok

      BoardTasks.open_task(record.brink_id, "recount") ->
        :ok

      true ->
        dept = Repo.get!(RockcutApi.Accounts.Department, task.department_id)

        case Tasks.uncomplete(dept, task, actor) do
          {:ok, _} -> :ok
          {:error, reason} -> Repo.rollback(reason)
        end
    end
  end

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

  defp changeable!(count, actor) do
    unless Authz.can?(actor, :change, {:yeast_record, count}), do: Repo.rollback(:forbidden)
    entries = Repo.all(from e in Entry, where: e.harvest_id == ^count.harvest_id)
    if sentence = change_refusal(count, entries), do: Repo.rollback({:conflict, sentence})
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
