defmodule RockcutApi.Scheduling.ScheduleEvent do
  @moduledoc """
  A schedule event (D32): something on the schedule with no assignee or
  position, e.g. a private party or a delivery. Managers of its department
  create it; published events are visible to everyone.

  An all-day event runs from Denver-local midnight on its first day to
  Denver-local midnight after its last day (`ends_at` is exclusive).

  A repeating event's occurrences share a `series_id`
  (`RockcutApi.Scheduling.ScheduleEventSeries`). `series_exception` marks an
  occurrence changed on its own ("this event only").
  """
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(draft published)

  schema "schedule_events" do
    field :title, :string
    field :notes, :string
    field :all_day, :boolean, default: false
    field :starts_at, :utc_datetime
    field :ends_at, :utc_datetime
    field :status, :string, default: "draft"
    field :series_exception, :boolean, default: false

    belongs_to :department, RockcutApi.Accounts.Department
    belongs_to :created_by, RockcutApi.Accounts.User
    belongs_to :series, RockcutApi.Scheduling.ScheduleEventSeries

    timestamps(type: :utc_datetime)
  end

  def statuses, do: @statuses

  def changeset(event, attrs) do
    event
    |> cast(attrs, [
      :department_id,
      :created_by_id,
      :title,
      :notes,
      :all_day,
      :starts_at,
      :ends_at,
      :status,
      :series_id,
      :series_exception
    ])
    |> update_change(:title, &String.trim/1)
    |> validate_required([:department_id, :title, :starts_at, :ends_at, :status])
    |> validate_length(:title, max: 100)
    |> validate_inclusion(:status, @statuses)
    |> validate_end_after_start()
    |> foreign_key_constraint(:department_id)
    |> foreign_key_constraint(:created_by_id)
    |> foreign_key_constraint(:series_id)
  end

  defp validate_end_after_start(changeset) do
    starts = get_field(changeset, :starts_at)
    ends = get_field(changeset, :ends_at)

    if starts && ends && DateTime.compare(ends, starts) != :gt do
      add_error(changeset, :ends_at, "must be after the start time")
    else
      changeset
    end
  end
end
