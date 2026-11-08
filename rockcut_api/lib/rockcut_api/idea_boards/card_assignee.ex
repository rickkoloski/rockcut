defmodule RockcutApi.IdeaBoards.CardAssignee do
  @moduledoc "D53 Part 2: one person on an Idea Board card, in order (`position`)."
  use Ecto.Schema

  @primary_key false
  schema "idea_card_assignees" do
    belongs_to :card, RockcutApi.IdeaBoards.Card, primary_key: true
    belongs_to :user, RockcutApi.Accounts.User, primary_key: true
    field :position, :integer, default: 0
    field :inserted_at, :utc_datetime
  end
end
