defmodule RockcutApi.Scheduling.Shift do
  use Ecto.Schema
  import Ecto.Changeset

  @statuses ~w(draft published)

  schema "shifts" do
    field :starts_at, :utc_datetime
    field :ends_at, :utc_datetime
    field :status, :string, default: "draft"
    field :notes, :string

    belongs_to :department, RockcutApi.Accounts.Department
    belongs_to :position, RockcutApi.Scheduling.Position
    belongs_to :assignee, RockcutApi.Accounts.User
    belongs_to :created_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def statuses, do: @statuses

  def changeset(shift, attrs) do
    shift
    |> cast(attrs, [
      :department_id,
      :position_id,
      :assignee_id,
      :created_by_id,
      :starts_at,
      :ends_at,
      :status,
      :notes
    ])
    |> validate_required([:department_id, :position_id, :starts_at, :ends_at, :status])
    |> validate_inclusion(:status, @statuses)
    |> validate_end_after_start()
    |> foreign_key_constraint(:department_id)
    |> foreign_key_constraint(:position_id)
    |> foreign_key_constraint(:assignee_id)
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
