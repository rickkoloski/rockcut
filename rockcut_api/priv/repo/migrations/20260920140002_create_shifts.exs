defmodule RockcutApi.Repo.Migrations.CreateShifts do
  use Ecto.Migration

  def change do
    create table(:shifts) do
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :position_id, references(:positions, on_delete: :restrict), null: false
      add :assignee_id, references(:users, on_delete: :nilify_all)
      add :created_by_id, references(:users, on_delete: :nilify_all)
      add :starts_at, :utc_datetime, null: false
      add :ends_at, :utc_datetime, null: false
      add :status, :string, null: false, default: "draft"
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:shifts, [:department_id])
    create index(:shifts, [:assignee_id])
    create index(:shifts, [:starts_at])
    create index(:shifts, [:status])
  end
end
