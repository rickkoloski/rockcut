defmodule RockcutApi.IdeaBoards.Event do
  @moduledoc """
  D53 Part 2: one change to an Idea Board (append-only), like `task_events`.
  `card_id` and `list_id` have no foreign key and `title` is a copy, so a
  deleted card's history still reads. `detail` holds old → new values.
  """
  use Ecto.Schema

  schema "idea_events" do
    field :board, :string
    field :card_id, :integer
    field :list_id, :integer
    field :action, :string
    field :title, :string
    field :detail, :map, default: %{}

    belongs_to :actor, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime, updated_at: false)
  end
end
