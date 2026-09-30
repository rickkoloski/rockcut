defmodule RockcutApi.Repo.Migrations.CreateScheduleEvents do
  use Ecto.Migration

  def change do
    create table(:schedule_events) do
      add :department_id, references(:departments, on_delete: :restrict), null: false
      add :created_by_id, references(:users, on_delete: :nilify_all)
      add :title, :string, null: false
      add :notes, :text
      add :all_day, :boolean, null: false, default: false
      add :starts_at, :utc_datetime, null: false
      add :ends_at, :utc_datetime, null: false
      add :status, :string, null: false, default: "draft"

      timestamps(type: :utc_datetime)
    end

    create index(:schedule_events, [:department_id])
    create index(:schedule_events, [:starts_at])
  end
end
