defmodule RockcutApi.Repo.Migrations.CreateBatchLogEntries do
  use Ecto.Migration

  def change do
    create table(:batch_log_entries) do
      add :batch_id, references(:batches, on_delete: :delete_all), null: false
      add :timestamp, :utc_datetime, null: false
      add :event_type, :string, null: false
      add :gravity, :decimal
      add :temperature, :decimal
      add :ph, :decimal
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:batch_log_entries, [:batch_id])
  end
end
