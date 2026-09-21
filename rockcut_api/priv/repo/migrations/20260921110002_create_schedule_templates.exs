defmodule RockcutApi.Repo.Migrations.CreateScheduleTemplates do
  use Ecto.Migration

  def change do
    create table(:schedule_templates) do
      add :name, :string, null: false
      add :kind, :string, null: false, default: "week"
      add :created_by_id, references(:users, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end
  end
end
