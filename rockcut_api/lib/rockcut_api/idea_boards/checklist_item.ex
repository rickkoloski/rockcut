defmodule RockcutApi.IdeaBoards.ChecklistItem do
  @moduledoc "D53 Part 2: one line of a card's checklist; ticked when `done_at` is set."
  use Ecto.Schema
  import Ecto.Changeset

  @max_text 200

  schema "idea_checklist_items" do
    field :text, :string
    field :done_at, :utc_datetime
    field :position, :integer, default: 0

    belongs_to :card, RockcutApi.IdeaBoards.Card
    belongs_to :done_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def max_text, do: @max_text

  def done?(%__MODULE__{done_at: at}), do: not is_nil(at)

  def changeset(item, attrs) do
    item
    |> cast(attrs, [:text])
    |> update_change(:text, &String.trim/1)
    |> validate_required([:text], message: "can't be blank")
    |> validate_length(:text, max: @max_text)
  end
end
