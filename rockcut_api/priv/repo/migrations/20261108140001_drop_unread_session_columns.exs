defmodule RockcutApi.Repo.Migrations.DropUnreadSessionColumns do
  use Ecto.Migration

  # D55 §2.8 (task 4963, D54's follow-up): two columns nothing reads any more.
  # `users.legacy_tokens_revoked_at` (D34's pre-D34 token cutoff; unread since
  # D51 part 2) and `user_sessions.device_token_id` (D34's "Sign in as me";
  # unread since D54). An API image from before D55 selects them, so rolling
  # the API back past D55 needs the pre-deploy snapshot (or this `down`).
  def up do
    drop_if_exists index(:user_sessions, [:device_token_id])

    alter table(:user_sessions) do
      remove :device_token_id
    end

    alter table(:users) do
      remove :legacy_tokens_revoked_at
    end
  end

  # The columns come back empty: what they held isn't needed by any release.
  def down do
    alter table(:users) do
      add :legacy_tokens_revoked_at, :utc_datetime
    end

    alter table(:user_sessions) do
      add :device_token_id, references(:device_tokens, on_delete: :delete_all)
    end

    create index(:user_sessions, [:device_token_id])
  end
end
