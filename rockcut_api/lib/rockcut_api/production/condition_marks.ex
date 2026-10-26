defmodule RockcutApi.Production.ConditionMarks do
  @moduledoc """
  D48 §3.8, "Marking a tank clean or dirty": a brewer records that an empty
  tank is clean or dirty from a day (`ConditionMark`). Only while no beer is
  in it (`:tank_in_use`), on a day from its last emptying through today
  (`:date_invalid`). Tank status and flags take the latest of its done
  exits, done CIPs and marks (`Parts.latest_condition/1`).
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Production.{BatchVessel, ConditionMark, Parts, Schedule, Tank}

  @doc "Every mark, by tank and day, with who made it."
  def list do
    Repo.all(from(m in ConditionMark, order_by: [m.tank_id, m.marked_on, m.id], preload: :user))
  end

  def get(id) do
    case RockcutApi.Production.Batches.to_int(id) do
      nil -> nil
      id -> Repo.get(ConditionMark, id)
    end
  end

  @doc """
  Mark `tank` `state` (`clean` / `dirty`) on `marked_on` (default today)
  with an optional `note` (≤ 500), as `actor`.
  """
  def create(%Tank{} = tank, attrs, %User{} = actor, today \\ Tasks.today()) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    attrs =
      if attrs["marked_on"] in [nil, ""], do: Map.put(attrs, "marked_on", today), else: attrs

    changeset =
      ConditionMark.changeset(%ConditionMark{tank_id: tank.id, user_id: actor.id}, attrs)

    with {:ok, mark} <- Ecto.Changeset.apply_action(changeset, :insert) do
      parts = parts_in(tank)

      cond do
        Enum.any?(parts, &Parts.in_tank?/1) ->
          {:error, :tank_in_use}

        Date.compare(mark.marked_on, today) == :gt or before_last_exit?(parts, mark.marked_on) ->
          {:error, :date_invalid}

        true ->
          changeset |> Repo.insert() |> preload_user()
      end
    end
  end

  def delete(%ConditionMark{} = mark), do: Repo.delete(mark)

  defp before_last_exit?(parts, day) do
    case parts
         |> Enum.filter(&Parts.emptied?/1)
         |> Enum.map(& &1.exit.done_on)
         |> Enum.max(Date, fn -> nil end) do
      nil -> false
      last -> Date.compare(day, last) == :lt
    end
  end

  # The parts that were ever in the tank.
  defp parts_in(%Tank{id: tank_id}) do
    ids = Repo.all(from(v in BatchVessel, where: v.tank_id == ^tank_id, select: v.batch_id))

    ids
    |> Schedule.batches()
    |> Parts.build()
    |> Enum.filter(&(&1.tank_id == tank_id))
  end

  defp preload_user({:ok, mark}), do: {:ok, Repo.preload(mark, :user)}
  defp preload_user(error), do: error
end
