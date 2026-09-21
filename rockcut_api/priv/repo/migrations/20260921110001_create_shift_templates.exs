defmodule RockcutApi.Repo.Migrations.CreateShiftTemplates do
  use Ecto.Migration

  def change do
    create table(:shift_templates) do
      add :position_id, references(:positions, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :start_time, :time, null: false
      add :end_time, :time, null: false

      timestamps(type: :utc_datetime)
    end

    create index(:shift_templates, [:position_id])
  end
end
