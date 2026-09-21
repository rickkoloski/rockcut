defmodule RockcutApi.Repo.Migrations.CreateTimeOffRequests do
  use Ecto.Migration

  def change do
    create table(:time_off_requests) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :type, :string, null: false
      add :starts_at, :utc_datetime, null: false
      add :ends_at, :utc_datetime, null: false
      add :all_day, :boolean, null: false, default: true
      add :note, :text
      add :status, :string, null: false, default: "pending"
      add :reviewed_by_id, references(:users, on_delete: :nilify_all)
      add :reviewer_note, :text
      add :reviewed_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:time_off_requests, [:user_id])
    create index(:time_off_requests, [:status])
    create index(:time_off_requests, [:starts_at])
  end
end
