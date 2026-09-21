defmodule RockcutApi.Repo.Migrations.CreateAuditLog do
  use Ecto.Migration

  def change do
    create table(:audit_log) do
      add :actor_id, references(:users, on_delete: :nilify_all)
      add :target_id, references(:users, on_delete: :nilify_all)
      add :action, :string, null: false
      add :detail, :map

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:audit_log, [:actor_id])
    create index(:audit_log, [:inserted_at])
  end
end
