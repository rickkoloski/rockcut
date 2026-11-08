defmodule RockcutApi.IdeaBoardFixtures do
  @moduledoc """
  D53 Part 2: Idea Board rows for tests, inserted directly (the write API
  comes in stage 3). Every board has its four starter lists from the
  migration (`starter/2`).
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User

  alias RockcutApi.IdeaBoards.{
    Card,
    CardAssignee,
    CardTask,
    ChecklistItem,
    Event,
    IdeaList,
    Label,
    Note,
    Watch
  }

  @now ~U[2026-11-06 21:14:00Z]

  @doc "A board's starter list (`Ideas`, `Planned`, `Doing`, `Done`), from the migration."
  def starter(board_key, name), do: Repo.get_by!(IdeaList, board: board_key, name: name)

  def list!(board_key, name, attrs \\ %{}) do
    position =
      Repo.one(from l in IdeaList, where: l.board == ^board_key, select: max(l.position)) || 0

    Repo.insert!(struct(%IdeaList{board: board_key, name: name, position: position + 1}, attrs))
  end

  def card!(%IdeaList{id: list_id}, title, attrs \\ %{}) do
    position =
      Repo.one(from c in Card, where: c.list_id == ^list_id, select: max(c.position)) || 0

    Repo.insert!(struct(%Card{list_id: list_id, title: title, position: position + 1}, attrs))
  end

  def assign!(%Card{id: card_id}, users) do
    users
    |> Enum.with_index()
    |> Enum.each(fn {%User{id: id}, position} ->
      Repo.insert!(%CardAssignee{
        card_id: card_id,
        user_id: id,
        position: position,
        inserted_at: @now
      })
    end)
  end

  def label!(board_key, name, color \\ "green") do
    Repo.insert!(%Label{board: board_key, name: name, color: color, position: 1})
  end

  def label_card!(%Card{id: card_id}, %Label{id: label_id}) do
    Repo.insert_all("idea_card_labels", [%{card_id: card_id, label_id: label_id}])
  end

  def item!(%Card{id: card_id}, text, position, done_by \\ nil) do
    Repo.insert!(%ChecklistItem{
      card_id: card_id,
      text: text,
      position: position,
      done_at: done_by && @now,
      done_by_id: done_by && done_by.id
    })
  end

  def note!(%Card{id: card_id}, %User{id: author_id}, body, inserted_at \\ @now) do
    Repo.insert!(%Note{
      card_id: card_id,
      author_id: author_id,
      body: body,
      inserted_at: inserted_at
    })
  end

  def watch!(%Card{id: card_id}, %User{id: user_id}) do
    Repo.insert!(%Watch{card_id: card_id, user_id: user_id, inserted_at: @now})
  end

  def sent!(%Card{id: card_id}, attrs) do
    Repo.insert!(struct(%CardTask{card_id: card_id}, attrs))
  end

  def event!(board_key, action, attrs \\ %{}) do
    Repo.insert!(struct(%Event{board: board_key, action: action}, attrs))
  end
end
