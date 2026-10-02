defmodule RockcutApi.Repo.Migrations.CreateDeviceTokensAndPairingCodes do
  use Ecto.Migration

  # D33 §3.2: one revocable token per paired tablet, and short-lived single-use
  # pairing codes. Both are stored only as HMAC hashes.
  def change do
    create table(:device_tokens) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :token_hash, :binary, null: false
      add :paired_by_id, references(:users, on_delete: :nilify_all)
      add :last_seen_at, :utc_datetime
      add :revoked_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:device_tokens, [:token_hash])
    create index(:device_tokens, [:user_id])

    create table(:device_pairing_codes) do
      add :user_id, references(:users, on_delete: :delete_all), null: false
      add :code_hash, :binary, null: false
      add :created_by_id, references(:users, on_delete: :nilify_all)
      add :expires_at, :utc_datetime, null: false
      add :used_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create unique_index(:device_pairing_codes, [:code_hash])
    create index(:device_pairing_codes, [:user_id])
  end
end
