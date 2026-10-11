defmodule RockcutApi.Repo.Migrations.CreateBreweryTaskEvents do
  use Ecto.Migration

  # D38 §3.1: the task board's change log (append-only, as D37's
  # beer_board_events). `task_id` has no foreign key and `title` is a copy, so
  # a deleted task's history still reads. `device_id` is the shared tablet a
  # change came from (D40); null until then. `detail` holds old → new values.
  def change do
    create table(:brewery_task_events) do
      add :task_id, :integer
      add :action, :string, null: false
      add :actor_id, references(:users, on_delete: :nilify_all)
      add :device_id, references(:users, on_delete: :nilify_all)
      add :title, :string
      add :detail, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:brewery_task_events, [:inserted_at])
    create index(:brewery_task_events, [:task_id])
  end
end
