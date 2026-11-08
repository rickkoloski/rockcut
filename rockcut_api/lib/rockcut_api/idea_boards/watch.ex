defmodule RockcutApi.IdeaBoards.Watch do
  @moduledoc "D53 Part 2 §4.6: a person watching a card (cards only; never automatic)."
  use Ecto.Schema

  @primary_key false
  schema "idea_watches" do
    belongs_to :card, RockcutApi.IdeaBoards.Card, primary_key: true
    belongs_to :user, RockcutApi.Accounts.User, primary_key: true
    field :inserted_at, :utc_datetime
  end
end
