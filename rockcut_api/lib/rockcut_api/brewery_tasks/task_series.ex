defmodule RockcutApi.BreweryTasks.TaskSeries do
  @moduledoc """
  D39: the rule behind a recurring Brewery task (spec §3.10). Every occurrence
  is an ordinary `Task` with this series' id and its `series_date`; the series
  keeps the rule, the content copied onto new occurrences, and how far they
  have been generated.

  `frequency` is the spec's word (`weekly`, `monthly`, `quarterly`,
  `annually`); monthly and quarterly also have a `month_rule` (`day`: day N,
  or the month's last day when it's shorter; `weekday`: the 1st–4th or last,
  `-1`, ISO weekday). `rule_kind/1` maps that to the internal
  `RockcutApi.Scheduling.Recurrence` rule.
  """
  use Ecto.Schema
  import Ecto.Changeset

  alias RockcutApi.BreweryTasks.Task

  @frequencies ~w(weekly monthly quarterly annually)
  @month_rules ~w(day weekday)
  @max_count 400

  schema "brewery_task_series" do
    field :title, :string
    field :notes, :string
    field :frequency, :string
    field :month_rule, :string
    field :interval, :integer, default: 1
    field :weekdays, {:array, :integer}
    field :day_of_month, :integer
    field :week_of_month, :integer
    field :weekday, :integer
    field :start_date, :date
    field :until_date, :date
    field :count, :integer
    field :generated_through, :date
    field :skipped_dates, {:array, :date}, default: []

    belongs_to :department, RockcutApi.Accounts.Department
    belongs_to :assignee, RockcutApi.Accounts.User
    belongs_to :created_by, RockcutApi.Accounts.User
    has_many :tasks, Task, foreign_key: :series_id

    timestamps(type: :utc_datetime)
  end

  def frequencies, do: @frequencies
  def max_count, do: @max_count

  @doc """
  The content and rule, as a person enters them. Options that don't belong
  to the chosen rule are cleared, so a stored series only has its own.
  """
  def changeset(series, attrs) do
    series
    |> cast(attrs, [
      :title,
      :notes,
      :assignee_id,
      :frequency,
      :month_rule,
      :interval,
      :weekdays,
      :day_of_month,
      :week_of_month,
      :weekday,
      :start_date,
      :until_date,
      :count
    ])
    |> update_change(:title, &trim/1)
    |> validate_required([:title], message: "can't be blank")
    |> validate_length(:title, max: Task.max_title())
    |> validate_length(:notes, max: Task.max_notes())
    |> validate_required([:frequency, :start_date])
    |> validate_inclusion(:frequency, @frequencies)
    |> validate_rule()
    |> validate_end()
  end

  @doc """
  The `Recurrence` rule kind: `weekly`, `monthly_day`, `monthly_weekday`,
  `quarterly_day`, `quarterly_weekday` or `annually`.
  """
  def rule_kind(%{frequency: "weekly"}), do: "weekly"
  def rule_kind(%{frequency: "annually"}), do: "annually"

  def rule_kind(%{frequency: f, month_rule: rule}) when f in ~w(monthly quarterly),
    do: "#{f}_#{rule}"

  @doc "The series as a `Recurrence` rule (its `frequency` is the rule kind)."
  def rule(%__MODULE__{} = s), do: %{s | frequency: rule_kind(s)}

  defp validate_rule(changeset) do
    case get_field(changeset, :frequency) do
      "weekly" ->
        days = get_field(changeset, :weekdays) || []

        changeset
        |> clear([:month_rule, :day_of_month, :week_of_month, :weekday])
        |> validate_required([:interval])
        |> validate_inclusion(:interval, 1..4, message: "repeats every 1 to 4 weeks")
        |> then(fn cs ->
          if days != [] and Enum.all?(days, &(&1 in 1..7)),
            do: put_change(cs, :weekdays, days |> Enum.uniq() |> Enum.sort()),
            else: add_error(cs, :weekdays, "pick at least one weekday")
        end)

      f when f in ~w(monthly quarterly) ->
        changeset
        |> clear([:weekdays])
        |> every_one()
        |> validate_required([:month_rule])
        |> validate_inclusion(:month_rule, @month_rules)
        |> validate_month_rule()

      "annually" ->
        changeset
        |> clear([:weekdays, :month_rule, :day_of_month, :week_of_month, :weekday])
        |> every_one()

      _ ->
        changeset
    end
  end

  defp validate_month_rule(changeset) do
    case get_field(changeset, :month_rule) do
      "day" ->
        changeset
        |> clear([:week_of_month, :weekday])
        |> validate_required([:day_of_month])
        |> validate_inclusion(:day_of_month, 1..31)

      "weekday" ->
        changeset
        |> clear([:day_of_month])
        |> validate_required([:week_of_month, :weekday])
        |> validate_inclusion(:week_of_month, [1, 2, 3, 4, -1])
        |> validate_inclusion(:weekday, 1..7)

      _ ->
        changeset
    end
  end

  # Only weekly has an interval.
  defp every_one(changeset) do
    if get_field(changeset, :interval) in [nil, 1],
      do: put_change(changeset, :interval, 1),
      else: add_error(changeset, :interval, "only weekly repeats can skip weeks")
  end

  defp clear(changeset, fields), do: Enum.reduce(fields, changeset, &put_change(&2, &1, nil))

  defp validate_end(changeset) do
    until = get_field(changeset, :until_date)
    start = get_field(changeset, :start_date)

    changeset =
      validate_number(changeset, :count,
        greater_than: 0,
        less_than_or_equal_to: @max_count,
        message: "must be 1 to #{@max_count} times"
      )

    cond do
      until && get_field(changeset, :count) ->
        add_error(changeset, :count, "choose an end date or a number of times, not both")

      until && start && Date.compare(until, start) == :lt ->
        add_error(changeset, :until_date, "must be on or after the start date")

      true ->
        changeset
    end
  end

  defp trim(nil), do: nil
  defp trim(s) when is_binary(s), do: String.trim(s)
end
