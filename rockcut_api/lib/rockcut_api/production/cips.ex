defmodule RockcutApi.Production.Cips do
  @moduledoc """
  D47 §3.10: standalone CIP & Sanitize, a step with a tank and no batch.
  Adding one can record it as already done. Moving, checking off and
  un-checking go through `Steps` (no links, so no prompt); this module adds,
  changes (tank, notes, assignee) and deletes them.
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Changeset
  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Accounts.User
  alias RockcutApi.Production.{Batches, Step, StepType, Steps}

  @doc "A standalone CIP by id, or nil."
  def get(id) do
    case Batches.to_int(id) do
      nil -> nil
      id -> Repo.one(from(s in Step, where: s.id == ^id and is_nil(s.batch_id)))
    end
  end

  @doc """
  Add one: `tank_id` (an active tank: `:tank_invalid`), `due_on`,
  `already_done` (records it done that day by `actor`; not in the future:
  `:done_on_future`), `notes`, `assignee_id`.
  """
  def create(attrs, %User{} = actor, today \\ Tasks.today()) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    Repo.transaction(fn ->
      tank_id = Batches.active_tank_id!(attrs["tank_id"]) || Repo.rollback(:tank_invalid)

      due_on =
        case Date.from_iso8601(to_string(attrs["due_on"] || "")) do
          {:ok, d} -> d
          _ -> Repo.rollback(:done_on_invalid)
        end

      done? = attrs["already_done"] in [true, "true", 1, "1"]
      if done? and Date.compare(due_on, today) == :gt, do: Repo.rollback(:done_on_future)
      type = Repo.one!(from(t in StepType, where: t.behavior == "cip", order_by: t.id, limit: 1))

      step =
        Repo.insert!(%Step{
          tank_id: tank_id,
          step_type_id: type.id,
          due_on: due_on,
          on_task_list: type.on_task_list,
          done_on: if(done?, do: due_on),
          done_by_id: if(done?, do: actor.id),
          completed_at: if(done?, do: DateTime.utc_now() |> DateTime.truncate(:second))
        })

      case Steps.update(step, Map.take(attrs, ["notes", "assignee_id"])) do
        {:ok, step} -> step
        {:error, cs} -> Repo.rollback(cs)
      end
    end)
  end

  @doc "Change its `tank_id`, `notes` or `assignee_id`."
  def update(%Step{batch_id: nil} = cip, attrs) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    Repo.transaction(fn ->
      cip =
        if Map.has_key?(attrs, "tank_id") do
          tank_id = Batches.active_tank_id!(attrs["tank_id"]) || Repo.rollback(:tank_invalid)
          cip |> Changeset.change(tank_id: tank_id) |> Repo.update!()
        else
          cip
        end

      case Steps.update(cip, Map.take(attrs, ["notes", "assignee_id"])) do
        {:ok, cip} -> cip
        {:error, cs} -> Repo.rollback(cs)
      end
    end)
  end

  def delete(%Step{batch_id: nil} = cip), do: Repo.delete(cip)
end
