defmodule RockcutApi.IdeaBoards.Cards do
  @moduledoc """
  D53 Part 2: writing Idea Board cards (§4.4, §4.5). Callers authorize first
  (`Authz` `:change` on the card, which covers its list's lock, and on a
  target list; `:manage` to lock, unlock and delete for good) and pass the
  acting person. Each write runs in one transaction with its History row.

  A list's cards that aren't archived are numbered 1, 2, 3, …; an archived
  card keeps its old number until it's restored, last in its list.

  **Edits** take `title`, `description`, `due_on`, `assignee_ids` (checked
  by `People`) and `label_ids` (this board's labels). One `card_edited`
  event records every field that changed, old → new.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Card, IdeaList, Label, Log, People}

  @doc "Add a card at the bottom of `list` (not archived) on `board`."
  def create(board, %IdeaList{archived_at: nil} = list, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      changeset =
        %Card{
          list_id: list.id,
          created_by_id: actor.id,
          position: length(active_ids(list.id)) + 1
        }
        |> Card.changeset(attrs)
        |> People.validate(board, attrs)

      with {:ok, label_ids} <- label_ids(board, attrs),
           {:ok, card} <- Repo.insert(changeset) do
        people = People.changed(attrs, []) || []
        if people != [], do: People.put!(card, people)
        if label_ids, do: put_labels!(card, label_ids)

        Log.log!(list.board, "card_created", actor, card, %{
          "list" => list.name,
          "assignee_ids" => people
        })

        card
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  def create(_board, %IdeaList{}, _attrs, _actor), do: {:error, :archived}

  @doc "Change a card's title, description, due date, people or labels."
  def update(board, %Card{} = card, attrs, %User{} = actor) do
    key = IdeaBoards.board_key(board)

    Repo.transaction(fn ->
      people_before = People.ids(card)
      labels_before = current_label_ids(card)

      changeset =
        card
        |> Card.changeset(attrs)
        |> People.validate(board, attrs, people_before)

      with {:ok, label_ids} <- label_ids(board, attrs),
           {:ok, updated} <- Repo.update(changeset) do
        # The description can be long: History says it changed, not what to.
        fields =
          for field <- [:title, :description, :due_on],
              Map.get(card, field) != Map.get(updated, field),
              into: %{} do
            if field == :description,
              do: {"description", true},
              else:
                {to_string(field),
                 %{"from" => Map.get(card, field), "to" => Map.get(updated, field)}}
          end

        fields =
          case People.changed(attrs, people_before) do
            nil ->
              fields

            ids ->
              People.put!(updated, ids)
              Map.put(fields, "assignee_ids", %{"from" => people_before, "to" => ids})
          end

        fields =
          if label_ids && Enum.sort(label_ids) != Enum.sort(labels_before) do
            put_labels!(updated, label_ids)
            Map.put(fields, "label_ids", %{"from" => labels_before, "to" => label_ids})
          else
            fields
          end

        if fields != %{}, do: Log.log!(key, "card_edited", actor, updated, %{"fields" => fields})
        updated
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  @doc """
  Put a card in `list_id` (a list on this board that isn't archived) ahead
  of `before_id`, or last when `before_id` is nil or not in that list. A
  list or `before_id` from another board is `{:error, :not_found}`. Both
  lists close up. Moving to another list is logged; a reorder isn't.
  """
  def move(
        board,
        %Card{archived_at: nil} = card,
        %IdeaList{archived_at: nil} = to,
        before_id,
        %User{} = actor
      ) do
    with {:ok, before_id} <- before_on_board(board, before_id) do
      Repo.transaction(fn ->
        from_list = Repo.get!(IdeaList, card.list_id)
        target = active_ids(to.id)
        order = Log.place(target, card.id, before_id)

        if to.id != card.list_id do
          Repo.update_all(from(c in Card, where: c.id == ^card.id),
            set: [list_id: to.id, updated_at: Log.now()]
          )

          Log.renumber!(Card, active_ids(from_list.id))
        end

        if order != target, do: Log.renumber!(Card, order)

        moved = Repo.get!(Card, card.id)

        if to.id != card.list_id do
          Log.log!(to.board, "card_moved", actor, moved, %{
            "from_list" => %{"id" => from_list.id, "name" => from_list.name},
            "to_list" => %{"id" => to.id, "name" => to.name}
          })
        end

        moved
      end)
    end
  end

  def move(_board, %Card{}, %IdeaList{}, _before_id, _actor), do: {:error, :archived}

  @doc "Lock (`true`) or unlock (`false`) a card; no change if it already is."
  def set_locked(board, %Card{} = card, locked?, %User{} = actor) do
    if Card.locked?(card) == locked? do
      {:ok, card}
    else
      Repo.transaction(fn ->
        attrs =
          if locked?,
            do: [locked_at: Log.now(), locked_by_id: actor.id],
            else: [locked_at: nil, locked_by_id: nil]

        card = Repo.update!(Ecto.Changeset.change(card, attrs))
        action = if locked?, do: "card_locked", else: "card_unlocked"
        Log.log!(IdeaBoards.board_key(board), action, actor, card)
        card
      end)
    end
  end

  @doc "Archive a card; the cards after it close up."
  def archive(board, %Card{archived_at: nil} = card, %User{} = actor) do
    Repo.transaction(fn ->
      card = Repo.update!(Ecto.Changeset.change(card, archived_at: Log.now()))
      Log.renumber!(Card, active_ids(card.list_id))
      Log.log!(IdeaBoards.board_key(board), "card_archived", actor, card)
      card
    end)
  end

  def archive(_board, %Card{} = card, _actor), do: {:ok, card}

  @doc """
  Bring an archived card back, last in its list. While its list is archived
  that's `{:error, :list_archived}` (restore the list instead).
  """
  def restore(_board, %Card{archived_at: nil} = card, _actor), do: {:ok, card}

  def restore(board, %Card{} = card, %User{} = actor) do
    case Repo.get!(IdeaList, card.list_id) do
      %IdeaList{archived_at: nil} ->
        Repo.transaction(fn ->
          position = length(active_ids(card.list_id)) + 1
          card = Repo.update!(Ecto.Changeset.change(card, archived_at: nil, position: position))
          Log.log!(IdeaBoards.board_key(board), "card_restored", actor, card)
          card
        end)

      _archived ->
        {:error, :list_archived}
    end
  end

  @doc """
  Delete an archived card for good, with its notes, checklist and watches
  (§4.1). Tasks already sent stay, and keep the card's title. A card that
  isn't archived is `{:error, :not_archived}`.
  """
  def delete(_board, %Card{archived_at: nil}, _actor), do: {:error, :not_archived}

  def delete(board, %Card{} = card, %User{} = actor) do
    Repo.transaction(fn ->
      Log.log!(IdeaBoards.board_key(board), "card_deleted", actor, card)
      Repo.delete!(card)
      :deleted
    end)
  end

  @doc "The ids of a list's cards that aren't archived, in order."
  def active_ids(list_id) do
    Repo.all(
      from c in Card,
        where: c.list_id == ^list_id and is_nil(c.archived_at),
        order_by: [asc: c.position, asc: c.id],
        select: c.id
    )
  end

  # `label_ids` from the params: `{:ok, nil}` for no change, `{:ok, ids}`
  # when every one is this board's, else a changeset error.
  defp label_ids(board, %{"label_ids" => ids}) when is_list(ids) do
    key = IdeaBoards.board_key(board)
    parsed = ids |> Enum.map(&Log.to_id/1)

    found =
      Repo.all(
        from l in Label,
          where: l.board == ^key and l.id in ^Enum.reject(parsed, &is_nil/1),
          select: l.id
      )

    if Enum.any?(parsed, &is_nil/1) or Enum.sort(Enum.uniq(parsed)) != Enum.sort(found),
      do: {:error, label_error()},
      else: {:ok, Enum.uniq(parsed)}
  end

  defp label_ids(_board, %{"label_ids" => nil}), do: {:ok, []}
  defp label_ids(_board, %{"label_ids" => _}), do: {:error, label_error()}
  defp label_ids(_board, _attrs), do: {:ok, nil}

  defp label_error do
    %Card{}
    |> Ecto.Changeset.change()
    |> Ecto.Changeset.add_error(:label_ids, "is invalid")
    |> Map.put(:action, :validate)
  end

  defp current_label_ids(%Card{id: id}) do
    Repo.all(
      from cl in "idea_card_labels",
        where: cl.card_id == ^id,
        order_by: cl.label_id,
        select: cl.label_id
    )
  end

  defp put_labels!(%Card{id: id}, label_ids) do
    Repo.delete_all(from cl in "idea_card_labels", where: cl.card_id == ^id)
    Repo.insert_all("idea_card_labels", Enum.map(label_ids, &%{card_id: id, label_id: &1}))
  end

  defp before_on_board(_board, nil), do: {:ok, nil}

  defp before_on_board(board, before_id) do
    case IdeaBoards.fetch_card(board, before_id) do
      {:ok, card} -> {:ok, card.id}
      error -> error
    end
  end
end
