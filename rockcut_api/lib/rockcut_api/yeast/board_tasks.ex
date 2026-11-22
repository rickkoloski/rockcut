defmodule RockcutApi.Yeast.BoardTasks do
  @moduledoc """
  D64 §7: the two system tasks a brink puts on the Brewery board, unassigned,
  at the bottom of their day: "Count YB2" (`recount`, due the harvest day,
  opened by every harvest, ticked by Add count) and "Clean YB2" (`clean`,
  due the day it emptied, ticked by Mark clean). At most one open task of
  each kind per brink (the partial unique index; a second harvest leaves the
  open one where it is). Otherwise they're board tasks like any other: they
  move, take notes, delete and show in History.

  Ticking a `clean` task, by any path (`Tasks.complete/5`, a person or the
  brewhouse device), clears the brink's dirty mark (`completed!/1`). Un-ticking
  it doesn't dirty it again.
  """
  import Ecto.Query

  alias RockcutApi.{Accounts, Repo, Tasks}
  alias RockcutApi.Tasks.{Event, Task}
  alias RockcutApi.Yeast.Brink

  @kinds ~w(recount clean)

  def title(%Brink{name: name}, "recount"), do: "Count #{name}"
  def title(%Brink{name: name}, "clean"), do: "Clean #{name}"

  @doc "The open task of `kind` for `brink`, or nil."
  def open_task(brink_id, kind) when kind in @kinds do
    Repo.one(
      from t in Task,
        where: t.yeast_brink_id == ^brink_id and t.yeast_kind == ^kind and is_nil(t.completed_at),
        limit: 1
    )
  end

  @doc "Open kinds per brink: `%{brink_id => MapSet of kinds}` (one query)."
  def open_kinds(brink_ids) do
    from(t in Task,
      where: t.yeast_brink_id in ^brink_ids and is_nil(t.completed_at),
      select: {t.yeast_brink_id, t.yeast_kind}
    )
    |> Repo.all()
    |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
    |> Map.new(fn {id, kinds} -> {id, MapSet.new(kinds)} end)
  end

  @doc """
  Open the brink's `kind` task due `due_on`, unless one is open already.
  Inside the caller's transaction. No Brewery department (a bare test
  database): nothing to do.
  """
  def open!(%Brink{} = brink, kind, %Date{} = due_on, actor) when kind in @kinds do
    with %{} = brewery <- Accounts.get_department_by_key("brewery"),
         nil <- open_task(brink.id, kind) do
      task =
        Repo.insert!(%Task{
          department_id: brewery.id,
          title: title(brink, kind),
          due_on: due_on,
          position: Tasks.next_position(brewery.id, due_on),
          created_by_id: actor.id,
          yeast_brink_id: brink.id,
          yeast_kind: kind
        })

      Repo.insert!(%Event{
        department_id: brewery.id,
        task_id: task.id,
        action: "created",
        actor_id: actor.id,
        device_id: actor.on_device_id,
        title: task.title,
        detail: %{"due_on" => Date.to_iso8601(due_on), "yeast_kind" => kind, "assignee_ids" => []}
      })

      task
    else
      _ -> nil
    end
  end

  @doc "Tick the brink's open `kind` task as `actor` (Add count, Mark clean); nothing open: nil."
  def tick!(%Brink{} = brink, kind, actor) when kind in @kinds do
    case open_task(brink.id, kind) do
      nil ->
        nil

      task ->
        case Tasks.complete_as(task, actor) do
          {:ok, done} -> done
          {:error, reason} -> Repo.rollback(reason)
        end
    end
  end

  @doc """
  The hook `Tasks` calls when a task is checked off: a brink's Clean task
  clears its dirty mark. Any other task: nothing.
  """
  def completed!(%Task{yeast_kind: "clean", yeast_brink_id: id}) when not is_nil(id) do
    from(b in Brink, where: b.id == ^id)
    |> Repo.update_all(set: [dirty: false, dirty_since: nil])

    :ok
  end

  def completed!(_task), do: :ok
end
