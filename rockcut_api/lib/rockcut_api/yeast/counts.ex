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

  alias RockcutApi.{Authz, Repo}
  alias RockcutApi.Yeast.{BoardTasks, Brink, Count, Entry, Harvests}

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
          |> Repo.insert()
          |> ok_or_rollback()

        BoardTasks.tick!(brink, "recount", actor)
        count
      end,
      mode: :immediate
    )
  end

  @doc "Change a count (its maker or a Brewery manager; not once a pitch is dated on or after it)."
  def update(%Count{} = count, attrs, actor) do
    Repo.transaction(
      fn ->
        changeable!(count, actor)
        count |> Count.changeset(attrs) |> Repo.update() |> ok_or_rollback()
      end,
      mode: :immediate
    )
  end

  @doc "Delete a count, on the same terms as a change."
  def delete(%Count{} = count, actor) do
    Repo.transaction(
      fn ->
        changeable!(count, actor)
        Repo.delete!(count)
      end,
      mode: :immediate
    )
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

    pitch =
      Repo.one(
        from e in Entry,
          where:
            e.harvest_id == ^count.harvest_id and e.kind in ["pitched"] and
              e.occurred_on >= ^count.counted_on,
          order_by: e.occurred_on,
          limit: 1,
          select: e.occurred_on
      )

    if pitch do
      Repo.rollback(
        {:conflict,
         "A pitch on #{Harvests.short(pitch)} used this count or a later one, so it can't be changed"}
      )
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
