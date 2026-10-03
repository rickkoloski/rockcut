defmodule RockcutApi.Repo.Migrations.CreateUserSessions do
  use Ecto.Migration

  # D34 §3.1: a person's sign-in is a revocable server-side session, stored only
  # as an HMAC hash. A session started on a paired tablet points at that
  # tablet's token and is deleted with it.
  def change do
    create table(:user_sessions) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :token_hash, :binary, null: false
      add :device_token_id, references(:device_tokens, on_delete: :delete_all)
      add :expires_at, :utc_datetime, null: false
      add :last_seen_at, :utc_datetime
      add :revoked_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:user_sessions, [:token_hash])
    create index(:user_sessions, [:user_id, :revoked_at])
    create index(:user_sessions, [:device_token_id])
  end
end
