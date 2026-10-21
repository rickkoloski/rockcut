defmodule RockcutApi.Production.StepLink do
  @moduledoc """
  D47 §3.5: `to_step` comes after `from_step`. `default_answer` is what the
  move prompt preselects when `from_step` moves: `move_all` (the steps after
  it move too) or `move_only`.
  """
  use Ecto.Schema

  schema "production_step_links" do
    field :default_answer, :string, default: "move_all"

    belongs_to :from_step, RockcutApi.Production.Step
    belongs_to :to_step, RockcutApi.Production.Step

    timestamps(type: :utc_datetime)
  end
end
