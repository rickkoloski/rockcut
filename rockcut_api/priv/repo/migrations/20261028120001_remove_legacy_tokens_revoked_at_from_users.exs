defmodule RockcutApi.Repo.Migrations.RemoveLegacyTokensRevokedAtFromUsers do
  @moduledoc """
  D51 (task 4058): pre-D34 `Phoenix.Token` sign-ins are no longer accepted, so
  the per-user cutoff for them goes. Rolling back adds the column back empty.
  """
  use Ecto.Migration

  def change do
    alter table(:users) do
      remove :legacy_tokens_revoked_at, :utc_datetime
    end
  end
end
