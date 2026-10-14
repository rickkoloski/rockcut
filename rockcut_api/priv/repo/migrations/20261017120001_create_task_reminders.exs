defmodule RockcutApi.Repo.Migrations.CreateTaskReminders do
  use Ecto.Migration

  # D40: the shift-end reminder's ledger (D38 spec §3.5). One row per shift
  # reminded, so a later scan (or the shift's end time being edited) never
  # sends a second one.
  def change do
    create table(:task_reminders) do
      add :shift_id, references(:shifts, on_delete: :delete_all), null: false
      add :sent_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:task_reminders, [:shift_id])
  end
end
