defmodule RockcutApi.IdeaBoards.Notes do
  @moduledoc """
  D53 Part 2: a card's notes timeline (§4.4). Notes stay open on locked
  lists and cards (decision 14): adding one is `:write` on the board, never
  `:change`. Editing is its author's, deleting its author's or a manager's
  (`Authz` `{:idea_note, board, note}`; callers authorize).
  """
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards
  alias RockcutApi.IdeaBoards.{Card, Log, Note}

  @doc "A note on this card, else `{:error, :not_found}`."
  def fetch(%Card{id: card_id}, id) do
    case Log.to_id(id) && Repo.get_by(Note, id: Log.to_id(id), card_id: card_id) do
      %Note{} = note -> {:ok, note}
      _ -> {:error, :not_found}
    end
  end

  def add(board, %Card{} = card, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      case Repo.insert(Note.changeset(%Note{card_id: card.id, author_id: actor.id}, attrs)) do
        {:ok, note} ->
          Log.log!(IdeaBoards.board_key(board), "note_added", actor, card, %{"note_id" => note.id})

          Repo.preload(note, :author)

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  @doc "Change a note's text; it's marked edited (`edited_at`)."
  def edit(board, %Card{} = card, %Note{} = note, attrs, %User{} = actor) do
    Repo.transaction(fn ->
      changeset = Note.changeset(note, attrs)

      changeset =
        if Ecto.Changeset.changed?(changeset, :body),
          do: Ecto.Changeset.put_change(changeset, :edited_at, Log.now()),
          else: changeset

      case Repo.update(changeset) do
        {:ok, updated} ->
          if updated.body != note.body,
            do:
              Log.log!(IdeaBoards.board_key(board), "note_edited", actor, card, %{
                "note_id" => note.id
              })

          Repo.preload(updated, :author)

        {:error, cs} ->
          Repo.rollback(cs)
      end
    end)
  end

  def delete(board, %Card{} = card, %Note{} = note, %User{} = actor) do
    Repo.transaction(fn ->
      Repo.delete!(note)

      Log.log!(IdeaBoards.board_key(board), "note_deleted", actor, card, %{
        "note_id" => note.id,
        "author_id" => note.author_id
      })

      :deleted
    end)
  end
end
