defmodule RockcutApi.Reminders.TaskReminder do
  @moduledoc """
  Dedup ledger row for the shift-end reminder (D40, D38 spec §3.5): one per
  shift, whether a reminder went out or nothing was open.
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "task_reminders" do
    field :sent_at, :utc_datetime

    belongs_to :shift, RockcutApi.Scheduling.Shift

    timestamps(type: :utc_datetime)
  end

  def changeset(reminder, attrs) do
    reminder
    |> cast(attrs, [:shift_id, :sent_at])
    |> validate_required([:shift_id, :sent_at])
    |> unique_constraint(:shift_id)
  end
end
