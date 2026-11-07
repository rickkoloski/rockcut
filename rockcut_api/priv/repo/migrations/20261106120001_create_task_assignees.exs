defmodule RockcutApi.Repo.Migrations.CreateTaskAssignees do
  use Ecto.Migration

  # D53 Part 1: a task or series can have several people. The join tables are
  # the source of truth; `assignee_id` stays, kept equal to the first assignee
  # (position 0) so a rolled-back API image still shows one person, and is
  # dropped in a later release. `Tasks.Assignees` is the only writer.

  def up do
    create table(:task_assignees, primary_key: false) do
      add :task_id, references(:tasks, on_delete: :delete_all), null: false
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :position, :integer, null: false, default: 0
      add :inserted_at, :utc_datetime, null: false
    end

    create unique_index(:task_assignees, [:task_id, :user_id])
    create index(:task_assignees, [:user_id])

    create table(:task_series_assignees, primary_key: false) do
      add :series_id, references(:task_series, on_delete: :delete_all), null: false
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :position, :integer, null: false, default: 0
      add :inserted_at, :utc_datetime, null: false
    end

    create unique_index(:task_series_assignees, [:series_id, :user_id])
    create index(:task_series_assignees, [:user_id])

    flush()

    execute """
    INSERT INTO task_assignees (task_id, user_id, position, inserted_at)
    SELECT id, assignee_id, 0, strftime('%Y-%m-%dT%H:%M:%S', 'now')
    FROM tasks WHERE assignee_id IS NOT NULL
    """

    execute """
    INSERT INTO task_series_assignees (series_id, user_id, position, inserted_at)
    SELECT id, assignee_id, 0, strftime('%Y-%m-%dT%H:%M:%S', 'now')
    FROM task_series WHERE assignee_id IS NOT NULL
    """
  end

  # `assignee_id` was kept on the first assignee, so going back loses only the
  # extra people.
  def down do
    drop table(:task_series_assignees)
    drop table(:task_assignees)
  end
end
