defmodule RockcutApi.Repo.Migrations.CreateAvailabilitySlots do
  use Ecto.Migration

  def change do
    create table(:availability_slots) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :weekday, :integer, null: false
      add :kind, :string, null: false, default: "unavailable"
      add :all_day, :boolean, null: false, default: true
      add :start_time, :time
      add :end_time, :time
      add :note, :text

      timestamps(type: :utc_datetime)
    end

    create index(:availability_slots, [:user_id])
    create index(:availability_slots, [:user_id, :weekday])
  end
end
