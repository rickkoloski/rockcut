defmodule RockcutApi.IdeaBoards.Checklist do
  @moduledoc """
  D53 Part 2: a card's checklist. Every write is a change to the card, so
  callers check `:change` on it (a lock freezes ticks too, §4.5). Items are
  numbered 1, 2, 3, … on their card.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Card, ChecklistItem, Log}

  @doc "An item on this card, else `{:error, :not_found}`."
  def fetch(%Card{id: card_id}, id) do
    case Log.to_id(id) && Repo.get_by(ChecklistItem, id: Log.to_id(id), card_id: card_id) do
      %ChecklistItem{} = item -> {:ok, item}
      _ -> {:error, :not_found}
    end
  end

  @doc "Add an item at the end."
  def add(board, %Card{} = card, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      item = %ChecklistItem{card_id: card.id, position: length(ids(card)) + 1}

      case Repo.insert(ChecklistItem.changeset(item, attrs)) do
        {:ok, item} ->
          log!(board, card, "checklist_added", actor, item)
          item

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Change an item's `text`, and tick (`done: true`) or untick it."
  def update(board, %Card{} = card, %ChecklistItem{} = item, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      changeset =
        case Map.fetch(attrs, "done") do
          {:ok, done} when done in [true, "true"] and is_nil(item.done_at) ->
            ChecklistItem.changeset(item, attrs)
            |> Ecto.Changeset.change(done_at: Log.now(), done_by_id: actor.id)

          {:ok, done} when done in [false, "false"] and not is_nil(item.done_at) ->
            ChecklistItem.changeset(item, attrs)
            |> Ecto.Changeset.change(done_at: nil, done_by_id: nil)

          _ ->
            ChecklistItem.changeset(item, attrs)
        end

      case Repo.update(changeset) do
        {:ok, updated} ->
          if updated.text != item.text,
            do: log!(board, card, "checklist_edited", actor, updated, %{"from" => item.text})

          cond do
            is_nil(item.done_at) and updated.done_at ->
              log!(board, card, "checklist_ticked", actor, updated)

            item.done_at && is_nil(updated.done_at) ->
              log!(board, card, "checklist_unticked", actor, updated)

            true ->
              :unchanged
          end

          updated

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Remove an item; the ones after it close up."
  def remove(board, %Card{} = card, %ChecklistItem{} = item, %User{} = actor) do
    Repo.transaction(fn ->
      Repo.delete!(item)
      Log.renumber!(ChecklistItem, ids(card))
      log!(board, card, "checklist_removed", actor, item)
      :deleted
    end)
  end

  @doc "Put the card's items in this order: every id once, else `{:error, :invalid_order}`."
  def reorder(%Card{} = card, ids) when is_list(ids) do
    current = ids(card)
    parsed = Enum.map(ids, &Log.to_id/1)

    if Enum.sort(parsed) == Enum.sort(current) and length(Enum.uniq(parsed)) == length(parsed) do
      Repo.transaction(fn -> Log.renumber!(ChecklistItem, parsed) end)
    else
      {:error, :invalid_order}
    end
  end

  def reorder(_card, _ids), do: {:error, :invalid_order}

  @doc "A card's item ids, in order."
  def ids(%Card{id: card_id}) do
    Repo.all(
      from i in ChecklistItem,
        where: i.card_id == ^card_id,
        order_by: [asc: i.position, asc: i.id],
        select: i.id
    )
  end

  defp log!(board, card, action, actor, item, detail \\ %{}) do
    Log.log!(
      IdeaBoards.board_key(board),
      action,
      actor,
      card,
      Map.merge(%{"item_id" => item.id, "text" => item.text}, detail)
    )
  end
end
