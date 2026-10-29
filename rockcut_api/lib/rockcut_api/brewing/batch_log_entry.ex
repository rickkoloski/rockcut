defmodule RockcutApi.Brewing.BatchLogEntry do
  use Ecto.Schema
  import Ecto.Changeset
  import RockcutApi.Brewing.Ranges

  schema "batch_log_entries" do
    field :timestamp, :utc_datetime
    field :event_type, :string
    field :gravity, :decimal
    field :temperature, :decimal
    field :ph, :decimal
    field :notes, :string

    belongs_to :batch, RockcutApi.Brewing.Batch

    timestamps(type: :utc_datetime)
  end

  @valid_event_types ~w(gravity_reading temp_reading dry_hop transfer note ph_reading other)

  def changeset(log_entry, attrs) do
    log_entry
    |> cast(attrs, [:batch_id, :timestamp, :event_type, :gravity, :temperature, :ph, :notes])
    |> validate_required([:batch_id, :timestamp, :event_type])
    |> validate_inclusion(:event_type, @valid_event_types)
    |> validate_gravity(:gravity)
    |> validate_range(:temperature, 20, 220)
    |> validate_range(:ph, 0, 14)
    |> foreign_key_constraint(:batch_id)
  end
end
