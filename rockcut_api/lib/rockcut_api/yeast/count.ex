defmodule RockcutApi.Yeast.Count do
  @moduledoc """
  D64 §4.7: a cell count on a brink's record: `counted_on` (not in the
  future), viable cells in millions per mL (> 0, 1 dp) and viability %
  (0–100, 1 dp).
  """
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "yeast_counts" do
    field :counted_on, :date
    field :viable_millions_per_ml, :decimal
    field :viability_pct, :decimal
    field :note, :string
    field :lock_version, :integer, default: 1

    belongs_to :harvest, RockcutApi.Yeast.Harvest
    # Lead decisions 3, gap 11: the Count task this count ticked.
    belongs_to :ticked_task, RockcutApi.Tasks.Task
    belongs_to :entered_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(count, attrs) do
    count
    |> cast(attrs, [:counted_on, :viable_millions_per_ml, :viability_pct, :note])
    |> validate_required([:counted_on, :viable_millions_per_ml, :viability_pct])
    |> validate_number(:viable_millions_per_ml, greater_than: 0, less_than: 100_000)
    |> validate_number(:viability_pct, greater_than_or_equal_to: 0, less_than_or_equal_to: 100)
    |> validate_places([:viable_millions_per_ml, :viability_pct], 1)
    |> validate_length(:note, max: 2_000)
    |> validate_change(:counted_on, fn _, d ->
      if Date.after?(d, RockcutApi.Tasks.today()),
        do: [counted_on: "can't be in the future"],
        else: []
    end)
  end
end
