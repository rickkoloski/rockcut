defmodule RockcutApi.Repo.Migrations.CreateNotifications do
  use Ecto.Migration

  def change do
    create table(:notifications) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :event, :string, null: false
      add :title, :string, null: false
      add :body, :text
      add :data, :map
      add :read_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:notifications, [:user_id])
    create index(:notifications, [:user_id, :read_at])

    alter table(:users) do
      add :notification_prefs, :map
    end
  end
end
