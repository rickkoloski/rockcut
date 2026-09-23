defmodule RockcutApi.Availability.Slot do
  @moduledoc """
  A recurring weekly availability slot for a user: on `weekday` (0=Sun..6=Sat,
  Denver calendar day) they are `unavailable` or `preferred`, either all day or
  for a `start_time`..`end_time` window (Denver wall clock). D25.
  """
  use Ecto.Schema
  import Ecto.Changeset

  @kinds ~w(unavailable preferred)

  schema "availability_slots" do
    field :weekday, :integer
    field :kind, :string, default: "unavailable"
    field :all_day, :boolean, default: true
    field :start_time, :time
    field :end_time, :time
    field :note, :string

    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def kinds, do: @kinds

  def changeset(slot, attrs) do
    slot
    |> cast(attrs, [:user_id, :weekday, :kind, :all_day, :start_time, :end_time, :note])
    |> validate_required([:user_id, :weekday, :kind, :all_day])
    |> validate_inclusion(:weekday, 0..6)
    |> validate_inclusion(:kind, @kinds)
    |> normalize_window()
    |> foreign_key_constraint(:user_id)
  end

  # All-day slots carry no times; timed slots require both, end after start.
  defp normalize_window(changeset) do
    if get_field(changeset, :all_day) do
      changeset |> put_change(:start_time, nil) |> put_change(:end_time, nil)
    else
      changeset
      |> validate_required([:start_time, :end_time])
      |> validate_end_after_start()
    end
  end

  defp validate_end_after_start(changeset) do
    starts = get_field(changeset, :start_time)
    ends = get_field(changeset, :end_time)

    if starts && ends && Time.compare(ends, starts) != :gt do
      add_error(changeset, :end_time, "must be after the start time")
    else
      changeset
    end
  end
end
