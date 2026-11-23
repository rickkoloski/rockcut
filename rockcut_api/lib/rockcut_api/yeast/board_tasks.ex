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
  the brink's latest one dirties it again while it's still empty
  (`uncompleted!/1`, lead decisions 3, gap 10).
  """
  import Ecto.Query

  alias RockcutApi.{Accounts, Repo, Tasks}
  alias RockcutApi.Tasks.{Event, Task}
  alias RockcutApi.Yeast.{Brink, Count, Entry, Harvest}

  @kinds ~w(recount clean)
  # The `edited` event's scope when a brink's new name went on its task.
  @brink "brink"

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

    # Cleaned since: un-checking a harvest that cleared the mark leaves it clean (gap 8).
    Repo.update_all(
      from(e in Entry,
        join: h in assoc(e, :harvest),
        where: h.brink_id == ^id and e.cleared_dirty
      ),
      set: [cleared_dirty: false]
    )

    :ok
  end

  def completed!(_task), do: :ok

  @doc """
  The hook before a brink's task is un-ticked: `:yeast_task_open` (rolled
  back) while the brink has another open task of its kind.
  """
  def reopening!(%Task{yeast_kind: kind, yeast_brink_id: id})
      when kind in @kinds and not is_nil(id) do
    if open_task(id, kind), do: Repo.rollback(:yeast_task_open)
    :ok
  end

  def reopening!(_task), do: :ok

  @doc """
  The hook after a task is un-ticked. A brink's latest Clean task: the brink
  is dirty again if it's empty, since the day it emptied (gap 10); with yeast
  in it, un-checking the harvest that cleared the mark puts it back (gap 8).
  A Count task: no count ticked it any more (gap 11).
  """
  def uncompleted!(%Task{yeast_kind: "clean", yeast_brink_id: id} = task) when not is_nil(id) do
    later? =
      Repo.exists?(
        from t in Task,
          where: t.yeast_brink_id == ^id and t.yeast_kind == "clean" and t.id > ^task.id
      )

    record =
      Repo.one(
        from h in Harvest,
          where: h.brink_id == ^id and h.status != "voided",
          order_by: [desc: h.id],
          limit: 1
      )

    unless later? do
      if record do
        Repo.update_all(
          from(e in Entry,
            where: e.harvest_id == ^record.id and not is_nil(e.cleared_dirty_since)
          ),
          set: [cleared_dirty: true]
        )
      end

      unless record && record.status == "in_brink" do
        since = (record && record.emptied_on) || task.due_on || Tasks.today()

        Repo.update_all(from(b in Brink, where: b.id == ^id and not b.dirty),
          set: [dirty: true, dirty_since: since]
        )
      end
    end

    :ok
  end

  def uncompleted!(%Task{yeast_kind: "recount", id: id}) do
    Repo.update_all(from(c in Count, where: c.ticked_task_id == ^id), set: [ticked_task_id: nil])
    :ok
  end

  def uncompleted!(_task), do: :ok

  @doc """
  Gap 12: the brink's open tasks take its new name, as `actor`. One whose
  title a person changed keeps it.
  """
  def renamed!(%Brink{name: same}, %Brink{name: same}, _actor), do: :ok

  def renamed!(%Brink{} = old, %Brink{} = new, actor) do
    for kind <- @kinds,
        task = open_task(old.id, kind),
        task.title == title(old, kind) do
      case Tasks.update_one(task, %{"title" => title(new, kind)}, actor, @brink) do
        {:ok, _} -> :ok
        {:error, reason} -> Repo.rollback(reason)
      end
    end

    :ok
  end

  @doc """
  Lead decisions 7 (gap 18): a done task that opens again takes the brink's
  name now, as `actor`, unless a person changed its title: it still has the
  one it was created with, or the last the brink's renaming gave it.
  """
  def reopened!(%Task{yeast_kind: kind, yeast_brink_id: id} = task, actor)
      when kind in @kinds and not is_nil(id) do
    title = Brink |> Repo.get!(id) |> title(kind)

    if task.title != title and task.title == own_title(task) do
      case Tasks.update_one(task, %{"title" => title}, actor, @brink) do
        {:ok, renamed} -> renamed
        {:error, reason} -> Repo.rollback(reason)
      end
    else
      task
    end
  end

  def reopened!(task, _actor), do: task

  defp own_title(%Task{id: id}) do
    from(e in Event,
      where: e.task_id == ^id and e.action in ["created", "edited"],
      order_by: [desc: e.id]
    )
    |> Repo.all()
    |> Enum.find_value(fn
      %{action: "created", title: title} -> title
      %{detail: %{"scope" => @brink, "to" => %{"title" => title}}} -> title
      _ -> nil
    end)
  end
end
