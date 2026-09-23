defmodule RockcutApi.Reminders.ShiftReminder do
  @moduledoc "Dedup ledger row: a reminder sent for a shift at a given offset (D22)."
  use Ecto.Schema
  import Ecto.Changeset

  schema "shift_reminders" do
    field :offset_minutes, :integer
    field :sent_at, :utc_datetime

    belongs_to :shift, RockcutApi.Scheduling.Shift

    timestamps(type: :utc_datetime)
  end

  def changeset(reminder, attrs) do
    reminder
    |> cast(attrs, [:shift_id, :offset_minutes, :sent_at])
    |> validate_required([:shift_id, :offset_minutes])
    |> unique_constraint([:shift_id, :offset_minutes])
  end
end
