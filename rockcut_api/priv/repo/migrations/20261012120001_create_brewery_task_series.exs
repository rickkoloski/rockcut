defmodule RockcutApi.Repo.Migrations.CreateBreweryTaskSeries do
  use Ecto.Migration

  # D39 (spec §3.1, §3.10): the rule behind a recurring Brewery task. Each
  # occurrence is an ordinary `brewery_tasks` row with `series_id` and the
  # `series_date` the rule produced it for; that pair is unique, so a moved
  # occurrence is never generated again on its old date. `generated_through`
  # is how far occurrences exist; the daily top-up looks it up by index.
  def change do
    create table(:brewery_task_series) do
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :title, :string, null: false
      add :notes, :text
      add :assignee_id, references(:users, on_delete: :nilify_all)
      # weekly | monthly | quarterly | annually; month_rule: day | weekday.
      add :frequency, :string, null: false
      add :month_rule, :string
      add :interval, :integer, null: false, default: 1
      add :weekdays, {:array, :integer}
      add :day_of_month, :integer
      add :week_of_month, :integer
      add :weekday, :integer
      add :start_date, :date, null: false
      add :until_date, :date
      add :count, :integer
      add :generated_through, :date
      add :skipped_dates, {:array, :date}
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:brewery_task_series, [:department_id])
    create index(:brewery_task_series, [:generated_through])

    alter table(:brewery_tasks) do
      add :series_id, references(:brewery_task_series, on_delete: :nilify_all)
      add :series_date, :date
      add :series_exception, :boolean, null: false, default: false
    end

    create unique_index(:brewery_tasks, [:series_id, :series_date])
  end
end
