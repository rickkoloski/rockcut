defmodule RockcutApi.Repo.Migrations.CreateMessages do
  use Ecto.Migration

  def change do
    create table(:messages) do
      add :channel_key, :string, null: false
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :body, :text, null: false

      timestamps(type: :utc_datetime)
    end

    create index(:messages, [:channel_key, :id])

    create table(:channel_reads) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :channel_key, :string, null: false
      add :last_read_message_id, :integer

      timestamps(type: :utc_datetime)
    end

    create unique_index(:channel_reads, [:user_id, :channel_key])
  end
end
