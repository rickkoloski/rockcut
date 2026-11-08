defmodule RockcutApiWeb.IdeaCardController do
  @moduledoc """
  D53 Part 2: Idea Board cards and what's on them (§4.3–§4.6), under
  `/api/idea_boards/:board/cards`. People only. Checks as
  `IdeaBoardAccess`: the board (403), the ids (404), then the lock (423).

    * Add a card: `:change` on its list. Edit, archive, restore: `:change`
      on the card (its own lock or its list's). Move: `:change` on the card
      and on the list it goes to. Lock, unlock, delete for good: `:manage`.
    * Checklist: `:change` on the card (a lock freezes ticks).
    * Notes: `:write` only (they stay open on locked things); edit is the
      author's, delete the author's or a manager's.
    * Watch: anyone who can open the board, locked or not.

  An archived card, or any card in an archived list, is read-only until
  it's restored (lead decision 2): edits, moves, locks, the checklist and
  notes are 422 `archived`; Watch, restore and a manager's delete for good
  still work.

  Card writes answer with the whole card, as `GET …/cards/:id`.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers,
    only: [idea_card: 1, idea_checklist_item: 1, idea_note: 1]

  import RockcutApiWeb.IdeaBoardAccess

  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Cards, Checklist, Lists, Notes, Watches}
  alias RockcutApiWeb.IdeaBoardErrors

  action_fallback RockcutApiWeb.FallbackController

  @card_fields ~w(title description due_on assignee_ids label_ids)

  ## Cards

  @doc "POST …/cards `{list_id, title, description, due_on, assignee_ids, label_ids}`."
  def create(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.fetch(board(conn), params["list_id"]),
         :ok <- change(conn, list),
         {:ok, card} <-
           Cards.create(board(conn), list, Map.take(params, @card_fields), current_user(conn)) do
      conn |> put_status(:created) |> render_card(card.id)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, card} <- changeable(conn, id),
         {:ok, _card} <-
           Cards.update(board(conn), card, Map.take(params, @card_fields), current_user(conn)) do
      render_card(conn, card.id)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "POST …/cards/:id/move `{list_id, before_id}`: `list_id` defaults to the card's own."
  def move(conn, %{"id" => id} = params) do
    with {:ok, card} <- changeable(conn, id),
         {:ok, to} <- Lists.fetch(board(conn), params["list_id"] || card.list_id),
         :ok <- change(conn, to),
         {:ok, _card} <-
           Cards.move(board(conn), card, to, params["before_id"], current_user(conn)) do
      render_card(conn, card.id)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def lock(conn, %{"id" => id}), do: set_locked(conn, id, true)
  def unlock(conn, %{"id" => id}), do: set_locked(conn, id, false)

  defp set_locked(conn, id, locked?) do
    with {:ok, card} <- live_card(conn, id),
         :ok <- allow(conn, :manage),
         {:ok, _card} <- Cards.set_locked(board(conn), card, locked?, current_user(conn)) do
      render_card(conn, card.id)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def archive(conn, %{"id" => id}) do
    with {:ok, card} <- lockable(conn, id),
         {:ok, _card} <- Cards.archive(board(conn), card, current_user(conn)) do
      render_card(conn, card.id)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def restore(conn, %{"id" => id}) do
    with {:ok, card} <- lockable(conn, id),
         {:ok, _card} <- Cards.restore(board(conn), card, current_user(conn)) do
      render_card(conn, card.id)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "DELETE …/cards/:id: an archived card, for good (managers)."
  def delete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, card} <- IdeaBoards.fetch_card(board(conn), id),
         :ok <- allow(conn, :manage),
         {:ok, :deleted} <- Cards.delete(board(conn), card, current_user(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> IdeaBoardErrors.handle(conn)
  end

  ## Checklist

  def add_item(conn, %{"id" => id} = params) do
    with {:ok, card} <- changeable(conn, id),
         {:ok, item} <-
           Checklist.add(board(conn), card, Map.take(params, ["text"]), current_user(conn)) do
      conn |> put_status(:created) |> json(%{data: idea_checklist_item(item)})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "PATCH …/cards/:id/checklist/:item_id `{text, done}`."
  def update_item(conn, %{"id" => id, "item_id" => item_id} = params) do
    with {:ok, card} <- changeable(conn, id),
         {:ok, item} <- Checklist.fetch(card, item_id),
         {:ok, item} <-
           Checklist.update(
             board(conn),
             card,
             item,
             Map.take(params, ~w(text done)),
             current_user(conn)
           ) do
      json(conn, %{data: idea_checklist_item(RockcutApi.Repo.preload(item, :done_by))})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def delete_item(conn, %{"id" => id, "item_id" => item_id}) do
    with {:ok, card} <- changeable(conn, id),
         {:ok, item} <- Checklist.fetch(card, item_id),
         {:ok, :deleted} <- Checklist.remove(board(conn), card, item, current_user(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "PUT …/cards/:id/checklist/order `{ids}`: every item once, in the new order."
  def order_items(conn, %{"id" => id} = params) do
    with {:ok, card} <- changeable(conn, id),
         {:ok, _} <- Checklist.reorder(card, params["ids"]) do
      render_card(conn, card.id)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  ## Notes

  def add_note(conn, %{"id" => id} = params) do
    with {:ok, card} <- live_card(conn, id),
         {:ok, note} <-
           Notes.add(board(conn), card, Map.take(params, ["body"]), current_user(conn)) do
      conn |> put_status(:created) |> json(%{data: idea_note(note)})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def update_note(conn, %{"id" => id, "note_id" => note_id} = params) do
    with {:ok, card} <- live_card(conn, id),
         {:ok, note} <- Notes.fetch(card, note_id),
         :ok <- note(conn, :edit, note),
         {:ok, note} <-
           Notes.edit(board(conn), card, note, Map.take(params, ["body"]), current_user(conn)) do
      json(conn, %{data: idea_note(note)})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def delete_note(conn, %{"id" => id, "note_id" => note_id}) do
    with {:ok, card} <- live_card(conn, id),
         {:ok, note} <- Notes.fetch(card, note_id),
         :ok <- note(conn, :delete, note),
         {:ok, :deleted} <- Notes.delete(board(conn), card, note, current_user(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> IdeaBoardErrors.handle(conn)
  end

  ## Watch

  def watch(conn, %{"id" => id}) do
    with :ok <- allow(conn, :read),
         {:ok, card} <- IdeaBoards.fetch_card(board(conn), id) do
      Watches.watch(card, current_user(conn))
      json(conn, %{data: %{watching: true}})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def unwatch(conn, %{"id" => id}) do
    with :ok <- allow(conn, :read),
         {:ok, card} <- IdeaBoards.fetch_card(board(conn), id) do
      Watches.unwatch(card, current_user(conn))
      json(conn, %{data: %{watching: false}})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  # The board, the card on it, archived or not, then the lock: what every
  # change to a card asks.
  defp changeable(conn, id) do
    with {:ok, card} <- live_card(conn, id),
         :ok <- change(conn, card) do
      {:ok, card}
    end
  end

  # The board, then a card on it that isn't archived (nor its list).
  defp live_card(conn, id) do
    with :ok <- allow(conn, :write),
         {:ok, card} <- IdeaBoards.fetch_card(board(conn), id) do
      if IdeaBoards.archived?(card), do: {:error, :archived}, else: {:ok, card}
    end
  end

  # Archive and restore ask for the lock but not for a live card.
  defp lockable(conn, id) do
    with :ok <- allow(conn, :write),
         {:ok, card} <- IdeaBoards.fetch_card(board(conn), id),
         :ok <- change(conn, card) do
      {:ok, card}
    end
  end

  defp render_card(conn, id) do
    {:ok, card} = IdeaBoards.get_card(board(conn), id, current_user(conn))
    json(conn, %{data: idea_card(card)})
  end
end
