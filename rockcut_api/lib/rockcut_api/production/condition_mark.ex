defmodule RockcutApi.Production.ConditionMark do
  @moduledoc """
  D48 §3.8: a brewer's mark that an empty tank is `clean` or `dirty` from
  `marked_on`, with an optional note. Not a step and not a task; it counts
  alongside done exits (dirty) and done CIPs (clean) for the tank's state.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @states ~w(clean dirty)
  @max_note 500

  schema "tank_condition_marks" do
    field :state, :string
    field :marked_on, :date
    field :note, :string

    belongs_to :tank, RockcutApi.Production.Tank
    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def states, do: @states

  @doc "The state, day and note; `ConditionMarks` checks the day against the tank."
  def changeset(mark, attrs) do
    mark
    |> cast(attrs, [:state, :marked_on, :note])
    |> update_change(:note, &trim/1)
    |> validate_required([:state], message: "Pick clean or dirty.")
    |> validate_inclusion(:state, @states, message: "Pick clean or dirty.")
    |> validate_required([:marked_on], message: "Pick the day.")
    |> validate_length(:note, max: @max_note)
  end

  defp trim(nil), do: nil

  defp trim(s) do
    case String.trim(s) do
      "" -> nil
      t -> t
    end
  end
end
