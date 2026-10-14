defmodule RockcutApi.Repo.Migrations.AddDepartmentIdToTaskEvents do
  use Ecto.Migration

  # D41 step 3: History is per board, so each event records its board's
  # department. Nullable (SQLite can't add a NOT NULL column without a
  # default). Backfilled from the event's task where it still exists, else
  # the Brewery: every event before D41 is the Brewery's (a deleted task's
  # events and the Daily item events have no task to read it from).
  def up do
    alter table(:task_events) do
      add :department_id, references(:departments, on_delete: :nilify_all)
    end

    flush()

    execute("""
    UPDATE task_events
    SET department_id = (SELECT t.department_id FROM tasks t WHERE t.id = task_events.task_id)
    WHERE task_id IS NOT NULL
    """)

    execute("""
    UPDATE task_events
    SET department_id = (SELECT d.id FROM departments d WHERE d.key = 'brewery')
    WHERE department_id IS NULL
    """)

    create index(:task_events, [:department_id, :inserted_at])
  end

  def down do
    drop index(:task_events, [:department_id, :inserted_at])

    alter table(:task_events) do
      remove :department_id
    end
  end
end
