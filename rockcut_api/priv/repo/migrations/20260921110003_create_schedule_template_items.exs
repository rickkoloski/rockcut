defmodule RockcutApi.Repo.Migrations.CreateScheduleTemplateItems do
  use Ecto.Migration

  def change do
    create table(:schedule_template_items) do
      add :schedule_template_id, references(:schedule_templates, on_delete: :delete_all),
        null: false

      add :position_id, references(:positions, on_delete: :restrict), null: false
      add :assignee_id, references(:users, on_delete: :nilify_all)
      add :day_index, :integer, null: false, default: 0
      add :start_time, :time, null: false
      add :end_time, :time, null: false
      add :notes, :text

      timestamps(type: :utc_datetime)
    end

    create index(:schedule_template_items, [:schedule_template_id])
  end
end
