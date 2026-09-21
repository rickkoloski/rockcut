defmodule RockcutApi.Scheduling.ScheduleTemplateItem do
  use Ecto.Schema
  import Ecto.Changeset

  schema "schedule_template_items" do
    field :day_index, :integer, default: 0
    field :start_time, :time
    field :end_time, :time
    field :notes, :string

    belongs_to :schedule_template, RockcutApi.Scheduling.ScheduleTemplate
    belongs_to :position, RockcutApi.Scheduling.Position
    belongs_to :assignee, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(item, attrs) do
    item
    |> cast(attrs, [:position_id, :assignee_id, :day_index, :start_time, :end_time, :notes])
    |> validate_required([:position_id, :day_index, :start_time, :end_time])
    |> validate_inclusion(:day_index, 0..6)
    |> foreign_key_constraint(:position_id)
    |> foreign_key_constraint(:assignee_id)
  end
end
