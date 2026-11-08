defmodule RockcutApi.IdeaBoards.Label do
  @moduledoc """
  D53 Part 2: a board's label. Anyone on the board creates one; renaming and
  deleting are for managers (`Authz`). `color` is a key from a fixed
  palette; the UI maps it to a color in each theme.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_name 30
  @colors ~w(green yellow orange red purple blue sky lime pink grey)

  schema "idea_labels" do
    field :board, :string
    field :name, :string
    field :color, :string
    field :position, :integer, default: 0

    timestamps(type: :utc_datetime)
  end

  def colors, do: @colors
  def max_name, do: @max_name

  def changeset(label, attrs) do
    label
    |> cast(attrs, [:name, :color])
    |> update_change(:name, &String.trim/1)
    |> validate_required([:name, :color], message: "can't be blank")
    |> validate_length(:name, max: @max_name)
    |> validate_inclusion(:color, @colors)
    |> unique_constraint(:name, name: :idea_labels_board_name_index)
  end
end
