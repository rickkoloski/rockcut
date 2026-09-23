defmodule RockcutApi.Repo.Migrations.CreatePushSubscriptions do
  use Ecto.Migration

  def change do
    create table(:push_subscriptions) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :endpoint, :string, null: false
      add :p256dh, :string, null: false
      add :auth, :string, null: false
      add :user_agent, :string

      timestamps(type: :utc_datetime)
    end

    # The endpoint is the subscription's identity — one row per browser/device.
    create unique_index(:push_subscriptions, [:endpoint])
    create index(:push_subscriptions, [:user_id])
  end
end
