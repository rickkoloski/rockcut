defmodule RockcutApi.Repo.Migrations.CreateShiftReminders do
  use Ecto.Migration

  def change do
    create table(:shift_reminders) do
      add :shift_id, references(:shifts, on_delete: :delete_all), null: false
      add :offset_minutes, :integer, null: false
      add :sent_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    # One reminder per shift per window (dedup ledger for the scanner).
    create unique_index(:shift_reminders, [:shift_id, :offset_minutes])
  end
end
