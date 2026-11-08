defmodule RockcutApi.Migrations.DropUnreadSessionColumnsTest do
  @moduledoc """
  D55 §2.8 (`drop_unread_session_columns`): `users.legacy_tokens_revoked_at`
  and `user_sessions.device_token_id` are gone; `down` brings them (and the
  index) back empty, and `up` again drops them, keeping every row. Run inside
  the test's transaction.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  alias RockcutApi.Sessions

  @version 20_261_108_140_001
  @migration RockcutApi.Repo.Migrations.DropUnreadSessionColumns

  setup_all do
    Code.require_file("priv/repo/migrations/20261108140001_drop_unread_session_columns.exs")
    :ok
  end

  defp column?(table, column) do
    %{rows: [[n]]} =
      Repo.query!("SELECT count(*) FROM pragma_table_info(?) WHERE name = ?", [table, column])

    n == 1
  end

  defp index?(name) do
    %{rows: [[n]]} =
      Repo.query!("SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?", [name])

    n == 1
  end

  test "up, down, up: the columns go, come back, go again; rows and sign-ins stay" do
    user = user_fixture()
    {token, _row} = Sessions.create(user)

    refute column?("users", "legacy_tokens_revoked_at")
    refute column?("user_sessions", "device_token_id")

    assert :ok = Ecto.Migrator.down(Repo, @version, @migration, log: false)
    assert column?("users", "legacy_tokens_revoked_at")
    assert column?("user_sessions", "device_token_id")
    assert index?("user_sessions_device_token_id_index")
    assert {:ok, _, _} = Sessions.authenticate(token)

    assert :ok = Ecto.Migrator.up(Repo, @version, @migration, log: false)
    refute column?("users", "legacy_tokens_revoked_at")
    refute column?("user_sessions", "device_token_id")
    refute index?("user_sessions_device_token_id_index")

    assert Repo.get!(RockcutApi.Accounts.User, user.id).email == user.email
    assert {:ok, _, _} = Sessions.authenticate(token)
  end
end
