defmodule RockcutApi.Repo.Migrations.AddScheduleFieldsToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :schedulable, :boolean, null: false, default: true
      add :schedule_order, :integer, null: false, default: 0
    end
  end
end
