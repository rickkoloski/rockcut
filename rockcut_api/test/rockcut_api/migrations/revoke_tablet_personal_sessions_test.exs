defmodule RockcutApi.Migrations.RevokeTabletPersonalSessionsTest do
  @moduledoc """
  D54 §3.2 (`revoke_tablet_personal_sessions`): the release signs out every
  personal session started on a tablet and nothing else. Run down (a no-op)
  and up again inside the test's transaction, with rows written the D34 way.

  D55 dropped `user_sessions.device_token_id`; each test first runs D55's
  migration down (inside the same transaction) to have the column back.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  alias RockcutApi.Sessions
  alias RockcutApi.Sessions.UserSession

  @version 20_261_102_120_001
  @migration RockcutApi.Repo.Migrations.RevokeTabletPersonalSessions

  @d55_version 20_261_108_120_001
  @d55_migration RockcutApi.Repo.Migrations.DropUnreadSessionColumns

  setup_all do
    Code.require_file("priv/repo/migrations/20261102120001_revoke_tablet_personal_sessions.exs")
    Code.require_file("priv/repo/migrations/20261108120001_drop_unread_session_columns.exs")
    :ok
  end

  # The schema as it was when this migration ran (before D55).
  setup do
    assert :ok = Ecto.Migrator.down(Repo, @d55_version, @d55_migration, log: false)
    :ok
  end

  # A D34 "Sign in as me" session: the column is no longer in the schema.
  defp on_tablet(user, device_token_id) do
    {token, row} = Sessions.create(user)

    Repo.query!("UPDATE user_sessions SET device_token_id = ? WHERE id = ?", [
      device_token_id,
      row.id
    ])

    {token, row}
  end

  test "S249 tablet sessions are revoked; the person's own devices and old revocations aren't" do
    user = user_fixture()
    device = device_fixture(%{name: "Taproom tablets", home: "bar"})
    {device_token, dt} = RockcutApi.Devices.issue_token(device, "Taproom iPad 1", nil)

    {tablet_token, tablet} = on_tablet(user, dt.id)
    {_, earlier} = on_tablet(user, dt.id)
    an_hour_ago = DateTime.utc_now() |> DateTime.add(-3600) |> DateTime.truncate(:second)
    :ok = Sessions.revoke(earlier, an_hour_ago)
    {phone_token, phone} = Sessions.create(user)

    assert {:ok, _, _} = Sessions.authenticate(tablet_token)

    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)

    assert Repo.get!(UserSession, tablet.id).revoked_at
    assert :error = Sessions.authenticate(tablet_token)
    assert Repo.get!(UserSession, earlier.id).revoked_at == an_hour_ago
    refute Repo.get!(UserSession, phone.id).revoked_at
    assert {:ok, _, _} = Sessions.authenticate(phone_token)
    # The tablet itself stays paired.
    assert RockcutApi.Devices.live_token(device_token).id == dt.id
  end

  test "down does nothing: a revoked session stays revoked" do
    user = user_fixture()
    device = device_fixture(%{name: "Taproom tablets", home: "bar"})
    {_, dt} = RockcutApi.Devices.issue_token(device, "Taproom iPad 1", nil)
    {_, row} = on_tablet(user, dt.id)

    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)
    revoked_at = Repo.get!(UserSession, row.id).revoked_at
    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    assert Repo.get!(UserSession, row.id).revoked_at == revoked_at
  end
end
