defmodule RockcutApi.Repo.Migrations.RevokeTabletPersonalSessions do
  use Ecto.Migration

  # D54 §3.2: "Sign in as me" is gone, so the release signs out every personal
  # session started on a tablet. `device_token_id` itself stays for a release
  # (a rolled-back image just sees these sessions as revoked).
  def up do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    repo().query!(
      "UPDATE user_sessions SET revoked_at = ?1, updated_at = ?1 WHERE device_token_id IS NOT NULL AND revoked_at IS NULL",
      [now]
    )
  end

  # A revoked session isn't brought back.
  def down, do: :ok
end
