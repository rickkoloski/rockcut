defmodule RockcutApi.IdeaBoards.Note do
  @moduledoc """
  D53 Part 2: an entry in a card's notes timeline. Its author edits it
  (`edited_at` marks it "edited"); notes stay under the author's name after
  they're deactivated.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_body 2_000

  schema "idea_notes" do
    field :body, :string
    field :edited_at, :utc_datetime

    belongs_to :card, RockcutApi.IdeaBoards.Card
    belongs_to :author, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def max_body, do: @max_body

  def changeset(note, attrs) do
    note
    |> cast(attrs, [:body])
    |> update_change(:body, &String.trim/1)
    |> validate_required([:body], message: "can't be blank")
    |> validate_length(:body, max: @max_body)
  end
end
