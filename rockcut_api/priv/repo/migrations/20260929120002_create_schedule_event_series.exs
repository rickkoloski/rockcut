defmodule RockcutApi.Repo.Migrations.CreateScheduleEventSeries do
  use Ecto.Migration

  def change do
    create table(:schedule_event_series) do
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :created_by_id, references(:users, on_delete: :nilify_all)
      add :title, :string, null: false
      add :notes, :text
      add :all_day, :boolean, null: false, default: false
      # Colorado wall-clock start; null for all-day series.
      add :start_time, :time
      add :duration_minutes, :integer
      add :span_days, :integer
      add :frequency, :string, null: false
      add :interval, :integer, null: false, default: 1
      add :weekdays, {:array, :integer}
      add :week_of_month, :integer
      add :weekday, :integer
      add :start_date, :date, null: false
      add :until_date, :date
      add :count, :integer
      add :generated_through, :date
      add :skipped_dates, {:array, :date}

      timestamps(type: :utc_datetime)
    end

    create index(:schedule_event_series, [:department_id])

    alter table(:schedule_events) do
      add :series_id, references(:schedule_event_series, on_delete: :nilify_all)
      add :series_exception, :boolean, null: false, default: false
    end

    create index(:schedule_events, [:series_id])
  end
end
