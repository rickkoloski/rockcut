defmodule RockcutApi.Production.BatchVessel do
  @moduledoc """
  D47 §3.5: a tank a scheduled batch occupies. `vessel_index` 0 is the first
  tank, 1 the one after the first Transfer/Filter, as in templates;
  `tank_id` nil = Unassigned.
  """
  use Ecto.Schema

  schema "batch_vessels" do
    field :vessel_index, :integer

    belongs_to :batch, RockcutApi.Brewing.Batch
    belongs_to :tank, RockcutApi.Production.Tank

    timestamps(type: :utc_datetime)
  end
end
