defmodule RockcutApi.IdeaBoards.Lists do
  @moduledoc """
  D53 Part 2: writing an Idea Board's lists (§4.4, §4.5). Callers authorize
  first (`Authz`: `:write` to add, `:change` on the list to rename, move,
  archive or restore it, `:archive` for the locked-card rule, `:manage` to
  lock, unlock and delete for good) and pass the acting person. Each write
  runs in one transaction with its History row.

  The board's lists that aren't archived are numbered 1, 2, 3, …; an
  archived list keeps its old number until it's restored, last.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{IdeaList, Log}

  @doc "A list on this board (archived or not), else `{:error, :not_found}`."
  def fetch(board, id) do
    key = IdeaBoards.board_key(board)

    case Log.to_id(id) && Repo.get_by(IdeaList, id: Log.to_id(id), board: key) do
      %IdeaList{} = list -> {:ok, list}
      _ -> {:error, :not_found}
    end
  end

  @doc "Add a list at the end."
  def create(board, attrs, %User{} = actor) do
    key = IdeaBoards.board_key(board)

    Repo.transaction(fn ->
      changeset =
        IdeaList.changeset(%IdeaList{board: key, position: length(active_ids(key)) + 1}, attrs)

      with {:ok, list} <- Repo.insert(changeset) do
        Log.log!(key, "list_created", actor, list)
        list
      else
        {:error, cs} -> Repo.rollback(cs)
      end
    end)
  end

  @doc "Rename a list."
  def rename(%IdeaList{} = list, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      case Repo.update(IdeaList.changeset(list, attrs)) do
        {:ok, %IdeaList{name: name} = updated} when name != list.name ->
          Log.log!(list.board, "list_renamed", actor, updated, %{
            "from" => list.name,
            "to" => name
          })

          updated

        {:ok, updated} ->
          updated

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc """
  Put a list ahead of `before_id` (a list on this board), or last when
  `before_id` is nil or archived. A `before_id` from another board is
  `{:error, :not_found}`. The other lists, locked ones included, move around
  it (§4.5).
  """
  def move(%IdeaList{archived_at: nil} = list, before_id, %User{} = actor) do
    with {:ok, before_id} <- before_on_board(list.board, before_id) do
      Repo.transaction(fn ->
        ids = active_ids(list.board)
        order = Log.place(ids, list.id, before_id)

        if order != ids do
          Log.renumber!(IdeaList, order)
          Log.log!(list.board, "list_moved", actor, list, %{"from_position" => list.position})
        end

        Repo.get!(IdeaList, list.id)
      end)
    end
  end

  def move(%IdeaList{}, _before_id, _actor), do: {:error, :archived}

  @doc "Lock (`true`) or unlock (`false`) a list; no change if it already is."
  def set_locked(%IdeaList{} = list, locked?, %User{} = actor) do
    if IdeaList.locked?(list) == locked? do
      {:ok, list}
    else
      Repo.transaction(fn ->
        attrs =
          if locked?,
            do: [locked_at: Log.now(), locked_by_id: actor.id],
            else: [locked_at: nil, locked_by_id: nil]

        list = Repo.update!(Ecto.Changeset.change(list, attrs))
        Log.log!(list.board, if(locked?, do: "list_locked", else: "list_unlocked"), actor, list)
        list
      end)
    end
  end

  @doc "Archive a list (its cards go with it); the lists after it close up."
  def archive(%IdeaList{archived_at: nil} = list, %User{} = actor) do
    Repo.transaction(fn ->
      list = Repo.update!(Ecto.Changeset.change(list, archived_at: Log.now()))
      Log.renumber!(IdeaList, active_ids(list.board))
      Log.log!(list.board, "list_archived", actor, list)
      list
    end)
  end

  def archive(%IdeaList{} = list, _actor), do: {:ok, list}

  @doc "Bring an archived list back, last, with its cards."
  def restore(%IdeaList{archived_at: nil} = list, _actor), do: {:ok, list}

  def restore(%IdeaList{} = list, %User{} = actor) do
    Repo.transaction(fn ->
      position = length(active_ids(list.board)) + 1
      list = Repo.update!(Ecto.Changeset.change(list, archived_at: nil, position: position))
      Log.log!(list.board, "list_restored", actor, list)
      list
    end)
  end

  @doc """
  Delete an archived list for good, with its cards and their notes,
  checklists and watches (§4.1). Tasks already sent stay. A list that isn't
  archived is `{:error, :not_archived}`.
  """
  def delete(%IdeaList{archived_at: nil}, _actor), do: {:error, :not_archived}

  def delete(%IdeaList{} = list, %User{} = actor) do
    Repo.transaction(fn ->
      cards =
        Repo.aggregate(
          from(c in RockcutApi.IdeaBoards.Card, where: c.list_id == ^list.id),
          :count
        )

      Log.log!(list.board, "list_deleted", actor, list, %{"cards" => cards})
      Repo.delete!(list)
      :deleted
    end)
  end

  @doc "The ids of the board's lists that aren't archived, in order."
  def active_ids(board_key) do
    Repo.all(
      from l in IdeaList,
        where: l.board == ^board_key and is_nil(l.archived_at),
        order_by: [asc: l.position, asc: l.id],
        select: l.id
    )
  end

  defp before_on_board(_key, nil), do: {:ok, nil}

  defp before_on_board(key, before_id) do
    case Log.to_id(before_id) && Repo.get(IdeaList, Log.to_id(before_id)) do
      %IdeaList{board: ^key, id: id} -> {:ok, id}
      _ -> {:error, :not_found}
    end
  end
end
