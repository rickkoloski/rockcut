defmodule RockcutApi.Tasks.Assignees do
  @moduledoc """
  D53 §3: the people on a task or a series. This is the only code that writes
  assignees: it replaces the join rows (`task_assignees`,
  `task_series_assignees`) and keeps `assignee_id` on the first, in the
  caller's transaction. `assignee_id` is a copy for one release (a rolled-back
  API image and UI tabs on the old version); the join rows are the truth.

  **Params** (`given/1`): `assignee_ids` wins; else a lone `assignee_id` means
  `[id]` and a blank one `[]`; neither means no change. Duplicates are dropped
  and the order given is kept: the first is the one `assignee_id` shows.

  **What's a change** (`changed/2`): different people. The same people in
  another order isn't one (lead decision 3): no write, no event, no scope
  question, no exception, and `assignee_id` stays put.

  **Who** (`validate/3`): only the people being added are checked, so someone
  who has since left doesn't block an unrelated edit.
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Changeset
  alias RockcutApi.{Accounts, Authz, Repo}
  alias RockcutApi.Accounts.{Department, User}
  alias RockcutApi.Tasks.{Task, TaskAssignee, TaskSeries, TaskSeriesAssignee}

  @doc """
  What `attrs` (string keys) ask for: a list of ids, `nil` for no change, or
  `:invalid` when an id isn't one.
  """
  def given(%{"assignee_ids" => ids}) when is_list(ids) do
    parsed = Enum.map(ids, &to_id/1)
    if Enum.any?(parsed, &is_nil/1), do: :invalid, else: Enum.uniq(parsed)
  end

  def given(%{"assignee_ids" => nil}), do: []
  def given(%{"assignee_ids" => _}), do: :invalid
  def given(%{"assignee_id" => blank}) when blank in [nil, ""], do: []

  def given(%{"assignee_id" => id}) do
    case to_id(id) do
      nil -> :invalid
      id -> [id]
    end
  end

  def given(_attrs), do: nil

  @doc """
  The new list when `attrs` ask for different people than `current`, else nil.
  Compared as sets: the same people in another order is nil.
  """
  def changed(attrs, current) do
    case given(attrs) do
      ids when is_list(ids) -> if Enum.sort(ids) != Enum.sort(current), do: ids
      _ -> nil
    end
  end

  @doc "A task's or series' people, first first."
  def ids(%Task{id: id}),
    do:
      Repo.all(
        from a in TaskAssignee,
          where: a.task_id == ^id,
          order_by: [asc: a.position],
          select: a.user_id
      )

  def ids(%TaskSeries{id: id}),
    do:
      Repo.all(
        from a in TaskSeriesAssignee,
          where: a.series_id == ^id,
          order_by: [asc: a.position],
          select: a.user_id
      )

  @doc "`%{task_id => ids}` for these tasks; a task with nobody isn't in it."
  def ids_by_task(task_ids) do
    Repo.all(
      from a in TaskAssignee,
        where: a.task_id in ^task_ids,
        order_by: [asc: a.task_id, asc: a.position],
        select: {a.task_id, a.user_id}
    )
    |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
  end

  @doc """
  Check the people `attrs` would add to `current`, on the changeset's board (its
  `department_id`). Each one who can't take a task there is an error under
  `assignee_ids` that names them: an active member of that department or an
  owner, never a device (`Authz.can_take_task?/2`).
  """
  def validate(changeset, attrs, current \\ []) do
    case given(attrs) do
      nil ->
        changeset

      :invalid ->
        Changeset.add_error(changeset, :assignee_ids, "is invalid")

      ids ->
        dept_id = Changeset.get_field(changeset, :department_id)

        Enum.reduce(ids -- current, changeset, fn id, changeset ->
          user = Accounts.get_user(id)

          if assignable?(user, dept_id),
            do: changeset,
            else: Changeset.add_error(changeset, :assignee_ids, refusal(user, dept_id))
        end)
    end
  end

  defp assignable?(%User{} = user, dept_id), do: Authz.can_take_task?(user, dept_id)
  defp assignable?(nil, _dept_id), do: false

  defp refusal(user, dept_id) do
    who = if user, do: user.name, else: "That person"

    case Repo.get(Department, dept_id) do
      %Department{name: name} -> "#{who} must be a #{name} member"
      nil -> "#{who} must be a member"
    end
  end

  @doc "Give the record this list (first first); returns it with `assignee_id` set."
  def put!(%Task{id: id} = task, ids) do
    now = now()
    put_all!(Task, [id], ids, now)
    %{task | assignee_id: List.first(ids), updated_at: now}
  end

  def put!(%TaskSeries{id: id} = series, ids) do
    now = now()
    put_all!(TaskSeries, [id], ids, now)
    %{series | assignee_id: List.first(ids), updated_at: now}
  end

  @doc "Write what `attrs` ask for, if it differs from the record's list. Validate first."
  def apply!(%{} = record, attrs) do
    case changed(attrs, ids(record)) do
      nil -> record
      ids -> put!(record, ids)
    end
  end

  @doc "Take `user_id` off the record; the next person becomes the first."
  def remove!(%{} = record, user_id), do: put!(record, ids(record) -- [user_id])

  @doc "Give every task or series in `record_ids` this list, in one go."
  def put_all!(schema, record_ids, ids, now \\ now())
  def put_all!(_schema, [], _ids, _now), do: :ok

  def put_all!(schema, record_ids, ids, now) do
    {join, key} = join_of(schema)

    Repo.delete_all(from j in join, where: field(j, ^key) in ^record_ids)

    rows =
      for record_id <- record_ids, {user_id, position} <- Enum.with_index(ids) do
        %{key => record_id, user_id: user_id, position: position, inserted_at: now}
      end

    # Four parameters a row, under SQLite's limit.
    rows |> Enum.chunk_every(1_000) |> Enum.each(&Repo.insert_all(join, &1))

    Repo.update_all(from(r in schema, where: r.id in ^record_ids),
      set: [assignee_id: List.first(ids), updated_at: now]
    )

    :ok
  end

  defp join_of(Task), do: {TaskAssignee, :task_id}
  defp join_of(TaskSeries), do: {TaskSeriesAssignee, :series_id}

  defp to_id(id) when is_integer(id) and id > 0, do: id

  defp to_id(s) when is_binary(s) do
    case Integer.parse(s) do
      {id, ""} when id > 0 -> id
      _ -> nil
    end
  end

  defp to_id(_), do: nil

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
