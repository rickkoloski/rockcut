defmodule RockcutApi.Scheduling.ScheduleEventSeries do
  @moduledoc """
  The rule behind a repeating schedule event (D32). Every occurrence is a real
  `ScheduleEvent` row with this series' id; the series keeps the rule, the
  shared content and how far occurrences have been generated.

  Patterns: `weekly` (ISO weekdays 1 = Mon … 7 = Sun, every 1 or 2 weeks) and
  `monthly_weekday` (the 1st–4th or last, `-1`, of a weekday). No fixed day of
  the month. Times are Colorado wall-clock (`RockcutApi.Scheduling.Recurrence`).
  """
  use Ecto.Schema
  import Ecto.Changeset

  @frequencies ~w(weekly monthly_weekday)
  @max_count 400

  schema "schedule_event_series" do
    field :title, :string
    field :notes, :string
    field :all_day, :boolean, default: false
    field :start_time, :time
    field :duration_minutes, :integer
    field :span_days, :integer
    field :frequency, :string
    field :interval, :integer, default: 1
    field :weekdays, {:array, :integer}
    field :week_of_month, :integer
    field :weekday, :integer
    field :start_date, :date
    field :until_date, :date
    field :count, :integer
    field :generated_through, :date
    field :skipped_dates, {:array, :date}, default: []

    belongs_to :department, RockcutApi.Accounts.Department
    belongs_to :created_by, RockcutApi.Accounts.User
    has_many :events, RockcutApi.Scheduling.ScheduleEvent, foreign_key: :series_id

    timestamps(type: :utc_datetime)
  end

  def changeset(series, attrs) do
    series
    |> cast(attrs, [
      :department_id,
      :created_by_id,
      :title,
      :notes,
      :all_day,
      :start_time,
      :duration_minutes,
      :span_days,
      :frequency,
      :interval,
      :weekdays,
      :week_of_month,
      :weekday,
      :start_date,
      :until_date,
      :count,
      :generated_through,
      :skipped_dates
    ])
    |> update_change(:title, &String.trim/1)
    |> validate_required([:department_id, :title, :frequency, :interval, :start_date])
    |> validate_length(:title, max: 100)
    |> validate_inclusion(:frequency, @frequencies)
    |> validate_inclusion(:interval, [1, 2])
    |> validate_number(:count, greater_than: 0, less_than_or_equal_to: @max_count)
    |> validate_pattern()
    |> validate_timing()
    |> validate_end()
    |> foreign_key_constraint(:department_id)
  end

  defp validate_pattern(changeset) do
    case get_field(changeset, :frequency) do
      "weekly" ->
        days = get_field(changeset, :weekdays) || []

        if days != [] and Enum.all?(days, &(&1 in 1..7)),
          do: changeset,
          else: add_error(changeset, :weekdays, "pick at least one weekday")

      "monthly_weekday" ->
        changeset
        |> validate_required([:week_of_month, :weekday])
        |> validate_inclusion(:week_of_month, [1, 2, 3, 4, -1])
        |> validate_inclusion(:weekday, 1..7)
        |> then(fn cs ->
          if get_field(cs, :interval) == 1,
            do: cs,
            else: add_error(cs, :interval, "monthly series repeat every month")
        end)

      _ ->
        changeset
    end
  end

  defp validate_timing(changeset) do
    if get_field(changeset, :all_day) do
      changeset
      |> validate_required([:span_days])
      |> validate_number(:span_days, greater_than: 0, less_than_or_equal_to: 31)
    else
      changeset
      |> validate_required([:start_time, :duration_minutes])
      |> validate_number(:duration_minutes, greater_than: 0, less_than_or_equal_to: 24 * 60)
    end
  end

  defp validate_end(changeset) do
    until = get_field(changeset, :until_date)
    start = get_field(changeset, :start_date)

    cond do
      until && get_field(changeset, :count) ->
        add_error(changeset, :count, "choose an end date or a number of times, not both")

      until && start && Date.compare(until, start) == :lt ->
        add_error(changeset, :until_date, "must be on or after the start date")

      true ->
        changeset
    end
  end
end
