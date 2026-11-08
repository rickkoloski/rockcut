defmodule RockcutApi.IdeaBoards.Watches do
  @moduledoc """
  D53 Part 2 §4.6: Watch, per person per card. Never automatic, never
  blocked by a lock; anyone who can open the board (callers check `:read`;
  the routes are people-only). Not History.
  """
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.IdeaBoards.{Card, Log, Watch, WatchPending}

  def watch(%Card{id: card_id}, %User{id: user_id}) do
    Repo.insert!(%Watch{card_id: card_id, user_id: user_id, inserted_at: Log.now()},
      on_conflict: :nothing,
      conflict_target: [:card_id, :user_id]
    )

    :ok
  end

  @doc "Stop watching; anything still pending for this person on the card goes too."
  def unwatch(%Card{id: card_id}, %User{id: user_id}) do
    Repo.transaction(fn ->
      Repo.delete_all(from w in Watch, where: w.card_id == ^card_id and w.user_id == ^user_id)

      Repo.delete_all(
        from p in WatchPending, where: p.card_id == ^card_id and p.watcher_id == ^user_id
      )
    end)

    :ok
  end
end
