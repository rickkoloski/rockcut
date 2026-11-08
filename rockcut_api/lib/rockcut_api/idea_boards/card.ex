defmodule RockcutApi.IdeaBoards.Card do
  @moduledoc """
  D53 Part 2: a card in an Idea Board list. Locked on its own (`locked_at`)
  or through its list (§4.5). Assignees go through `card_assignees`, in
  order; labels through `card_labels`.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_title 200
  @max_description 10_000

  schema "idea_cards" do
    field :title, :string
    field :description, :string
    field :due_on, :date
    field :position, :integer, default: 0
    field :locked_at, :utc_datetime
    field :archived_at, :utc_datetime
    # Set by `IdeaBoards` for the card's face and dialog.
    field :checklist_total, :integer, virtual: true, default: 0
    field :checklist_done, :integer, virtual: true, default: 0
    field :note_count, :integer, virtual: true, default: 0
    field :watching, :boolean, virtual: true, default: false

    belongs_to :list, RockcutApi.IdeaBoards.IdeaList
    belongs_to :locked_by, RockcutApi.Accounts.User
    belongs_to :created_by, RockcutApi.Accounts.User

    has_many :assignee_links, RockcutApi.IdeaBoards.CardAssignee, preload_order: [asc: :position]

    has_many :assignees, through: [:assignee_links, :user]
    many_to_many :labels, RockcutApi.IdeaBoards.Label, join_through: "idea_card_labels"

    has_many :checklist_items, RockcutApi.IdeaBoards.ChecklistItem,
      preload_order: [asc: :position, asc: :id]

    has_many :notes, RockcutApi.IdeaBoards.Note, preload_order: [desc: :inserted_at, desc: :id]
    has_many :sent_tasks, RockcutApi.IdeaBoards.CardTask, preload_order: [asc: :id]

    timestamps(type: :utc_datetime)
  end

  def max_title, do: @max_title
  def max_description, do: @max_description

  def locked?(%__MODULE__{locked_at: at}), do: not is_nil(at)

  @doc "Title, description and due date, as a person enters them."
  def changeset(card, attrs) do
    card
    |> cast(attrs, [:title, :description, :due_on])
    |> update_change(:title, &RockcutApi.IdeaBoards.Log.trim/1)
    |> validate_required([:title], message: "can't be blank")
    |> validate_length(:title, max: @max_title)
    |> validate_length(:description, max: @max_description)
  end
end
