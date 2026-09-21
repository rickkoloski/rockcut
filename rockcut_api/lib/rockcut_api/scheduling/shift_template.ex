defmodule RockcutApi.Scheduling.ShiftTemplate do
  use Ecto.Schema
  import Ecto.Changeset

  schema "shift_templates" do
    field :name, :string
    field :start_time, :time
    field :end_time, :time

    belongs_to :position, RockcutApi.Scheduling.Position

    timestamps(type: :utc_datetime)
  end

  def changeset(template, attrs) do
    template
    |> cast(attrs, [:position_id, :name, :start_time, :end_time])
    |> validate_required([:position_id, :name, :start_time, :end_time])
    |> foreign_key_constraint(:position_id)
  end
end
