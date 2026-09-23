defmodule RockcutApi.Repo.Migrations.AddActivitySeenAtToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :activity_seen_at, :utc_datetime
    end

    # Existing owners start caught up to the newest audit entry (or now), so the
    # change-log badge only lights up for entries created from here on.
    execute(
      "UPDATE users SET activity_seen_at = (SELECT COALESCE(MAX(inserted_at), datetime('now')) FROM audit_log)",
      ""
    )
  end
end
