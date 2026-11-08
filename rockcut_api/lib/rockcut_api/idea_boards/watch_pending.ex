defmodule RockcutApi.IdeaBoards.WatchPending do
  @moduledoc """
  D53 Part 2 §4.6: a change to a card that a watcher hasn't been told about
  yet. The scanner sends one notification per watcher per card once the
  card's oldest pending row is 10 minutes old, then deletes the rows.
  """
  use Ecto.Schema

  schema "idea_watch_pending" do
    field :change, :string
    field :detail, :map, default: %{}

    belongs_to :card, RockcutApi.IdeaBoards.Card
    belongs_to :watcher, RockcutApi.Accounts.User
    belongs_to :actor, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
