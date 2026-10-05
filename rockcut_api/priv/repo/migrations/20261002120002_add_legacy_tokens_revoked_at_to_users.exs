defmodule RockcutApi.Repo.Migrations.AddLegacyTokensRevokedAtToUsers do
  use Ecto.Migration

  # D34 §3.7: once set, every pre-D34 (Phoenix.Token) sign-in token of the user
  # is refused. Removed by the follow-up once those tokens have all expired.
  def change do
    alter table(:users) do
      add :legacy_tokens_revoked_at, :utc_datetime
    end
  end
end
