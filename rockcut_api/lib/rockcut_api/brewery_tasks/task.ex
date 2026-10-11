defmodule RockcutApi.BreweryTasks.Task do
  @moduledoc """
  D38: one task on the Brewery board. `due_on` is the Colorado day it's planned
  for (nil = the Future list) and never changes when it's finished;
  `completed_display` decides where a finished task shows (see `Placement`).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @max_title 200
  @max_notes 2_000
  @displays ~w(planned_day completed_day both)

  schema "brewery_tasks" do
    field :title, :string
    field :notes, :string
    field :due_on, :date
    field :position, :integer, default: 0
    field :completed_at, :utc_datetime
    field :completed_on, :date
    field :completed_display, :string

    belongs_to :department, RockcutApi.Accounts.Department
    belongs_to :assignee, RockcutApi.Accounts.User
    belongs_to :completed_by, RockcutApi.Accounts.User
    belongs_to :created_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def max_title, do: @max_title
  def max_notes, do: @max_notes
  def displays, do: @displays

  def done?(%__MODULE__{completed_at: at}), do: not is_nil(at)

  @doc "Title, notes, assignee and day, as a person enters or edits them."
  def changeset(task, attrs) do
    task
    |> cast(attrs, [:title, :notes, :assignee_id, :due_on])
    |> update_change(:title, &trim/1)
    |> validate_required([:title], message: "can't be blank")
    |> validate_length(:title, max: @max_title)
    |> validate_length(:notes, max: @max_notes)
  end

  @doc "Check off (all four fields) or clear them (`nil`s)."
  def completion_changeset(task, attrs) do
    task
    |> cast(attrs, [:completed_at, :completed_by_id, :completed_on, :completed_display])
    |> validate_inclusion(:completed_display, @displays)
  end

  defp trim(nil), do: nil
  defp trim(s) when is_binary(s), do: String.trim(s)
end
