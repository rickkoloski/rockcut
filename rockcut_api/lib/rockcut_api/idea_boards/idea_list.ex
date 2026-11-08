defmodule RockcutApi.IdeaBoards.IdeaList do
  @moduledoc """
  D53 Part 2: a list (column) on an Idea Board. `board` is a department key
  or `company` (`IdeaBoards.board_key/1`). A lock binds non-managers (§4.5;
  the decision is `Authz`'s); `archived_at` hides the list and its cards
  until it's restored.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_name 80

  schema "idea_lists" do
    field :board, :string
    field :name, :string
    field :position, :integer, default: 0
    field :locked_at, :utc_datetime
    field :archived_at, :utc_datetime
    # "Archived" shows how many cards an archived list holds.
    field :card_count, :integer, virtual: true

    belongs_to :locked_by, RockcutApi.Accounts.User
    has_many :cards, RockcutApi.IdeaBoards.Card, foreign_key: :list_id

    timestamps(type: :utc_datetime)
  end

  def max_name, do: @max_name

  def locked?(%__MODULE__{locked_at: at}), do: not is_nil(at)

  @doc "The name, as a person enters it."
  def changeset(list, attrs) do
    list
    |> cast(attrs, [:name])
    |> update_change(:name, &RockcutApi.IdeaBoards.Log.trim/1)
    |> validate_required([:name], message: "can't be blank")
    |> validate_length(:name, max: @max_name)
  end
end
