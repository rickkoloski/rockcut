defmodule RockcutApi.Repo.Migrations.CreateBreweryTasks do
  use Ecto.Migration

  # D38 §3.1: the Brewery task board. `due_on` is a Colorado date (null = the
  # Future list); `position` orders a task within its day or the Future list.
  # The completion fields are all set together and cleared together. D39 adds
  # the `series_*` columns.
  def change do
    create table(:brewery_tasks) do
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :title, :string, null: false
      add :notes, :text
      add :due_on, :date
      add :position, :integer, null: false, default: 0
      add :assignee_id, references(:users, on_delete: :nilify_all)
      add :completed_at, :utc_datetime
      add :completed_by_id, references(:users, on_delete: :nilify_all)
      add :completed_on, :date
      add :completed_display, :string
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end

    create index(:brewery_tasks, [:department_id, :due_on, :position])
    create index(:brewery_tasks, [:department_id, :completed_on])
    create index(:brewery_tasks, [:assignee_id])
  end
end
