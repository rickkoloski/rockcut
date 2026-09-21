defmodule RockcutApi.TimeOff.Request do
  use Ecto.Schema
  import Ecto.Changeset

  @types ~w(pto sick unpaid personal)
  @statuses ~w(pending approved denied cancelled)

  schema "time_off_requests" do
    field :type, :string
    field :starts_at, :utc_datetime
    field :ends_at, :utc_datetime
    field :all_day, :boolean, default: true
    field :note, :string
    field :status, :string, default: "pending"
    field :reviewer_note, :string
    field :reviewed_at, :utc_datetime

    belongs_to :user, RockcutApi.Accounts.User
    belongs_to :reviewed_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def types, do: @types
  def statuses, do: @statuses

  def create_changeset(request, attrs) do
    request
    |> cast(attrs, [:user_id, :type, :starts_at, :ends_at, :all_day, :note])
    |> validate_required([:user_id, :type, :starts_at, :ends_at])
    |> validate_inclusion(:type, @types)
    |> validate_end_after_start()
    |> put_change(:status, "pending")
    |> foreign_key_constraint(:user_id)
  end

  defp validate_end_after_start(changeset) do
    starts = get_field(changeset, :starts_at)
    ends = get_field(changeset, :ends_at)

    if starts && ends && DateTime.compare(ends, starts) != :gt do
      add_error(changeset, :ends_at, "must be after the start")
    else
      changeset
    end
  end
end
