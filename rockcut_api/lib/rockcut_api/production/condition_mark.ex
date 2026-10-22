defmodule RockcutApi.Production.ConditionMark do
  @moduledoc """
  D48 §3.8: a brewer's mark that an empty tank is `clean` or `dirty` from
  `marked_on`, with an optional note. Not a step and not a task; it counts
  alongside done exits (dirty) and done CIPs (clean) for the tank's state.
  """
  use Ecto.Schema

  @states ~w(clean dirty)

  schema "tank_condition_marks" do
    field :state, :string
    field :marked_on, :date
    field :note, :string

    belongs_to :tank, RockcutApi.Production.Tank
    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def states, do: @states
end
