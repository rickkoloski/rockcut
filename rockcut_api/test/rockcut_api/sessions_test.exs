defmodule RockcutApi.SessionsTest do
  @moduledoc "D34: revocable sign-in sessions (spec §3.1–§3.8)."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  alias RockcutApi.{Devices, Repo, Sessions}
  alias RockcutApi.Sessions.UserSession

  @t0 ~U[2026-10-02 18:00:00Z]

  defp at(seconds), do: DateTime.add(@t0, seconds)

  defp tablet do
    device = device_fixture(%{name: "Taproom tablets", home: "bar"})
    {_token, row} = Devices.issue_token(device, "Taproom iPad 1", nil)
    {device, row}
  end

  describe "create/3" do
    test "a normal session: ses_ token, hash only, 30 days" do
      user = user_fixture()
      {token, row} = Sessions.create(user, [], @t0)

      assert "ses_" <> _ = token
      assert row.token_hash == RockcutApi.Tokens.hash(token)
      refute row.token_hash == token
      assert row.expires_at == at(30 * 24 * 3600)
    end

    test "D54: a tablet's device token is no longer an option" do
      user = user_fixture()
      {_device, dt} = tablet()
      assert_raise ArgumentError, fn -> Sessions.create(user, [device_token: dt], @t0) end
    end

    test "prunes the user's rows that ended over a week ago, and no one else's" do
      user = user_fixture()
      other = user_fixture()
      {_, old} = Sessions.create(user, [max_age: 60], @t0)
      {_, revoked} = Sessions.create(user, [], @t0)
      :ok = Sessions.revoke(revoked, @t0)
      {_, recent} = Sessions.create(user, [], @t0)
      {_, others} = Sessions.create(other, [max_age: 60], @t0)

      Sessions.create(user, [], at(8 * 24 * 3600))

      refute Repo.get(UserSession, old.id)
      refute Repo.get(UserSession, revoked.id)
      assert Repo.get(UserSession, recent.id)
      assert Repo.get(UserSession, others.id)
    end
  end

  describe "authenticate/2" do
    test "a normal session is never touched (no write per request)" do
      user = user_fixture()
      {token, row} = Sessions.create(user, [], @t0)
      assert {:ok, _, _} = Sessions.authenticate(token, at(10))
      assert {:ok, _, _} = Sessions.authenticate(token, at(120))
      assert is_nil(Repo.get!(UserSession, row.id).last_seen_at)
    end

    test "refuses unknown, non-ses_, revoked and expired tokens" do
      user = user_fixture()
      {token, row} = Sessions.create(user, [max_age: 100], @t0)

      assert :error = Sessions.authenticate("ses_made-up", @t0)
      assert :error = Sessions.authenticate("dev_" <> "x", @t0)
      assert :error = Sessions.authenticate(token, at(100))
      assert {:ok, _, _} = Sessions.authenticate(token, at(99))

      :ok = Sessions.revoke(row, at(1))
      assert :error = Sessions.authenticate(token, at(2))
    end

    test "refuses an inactive user" do
      user = user_fixture()
      {token, _} = Sessions.create(user, [], @t0)
      Repo.update!(Ecto.Changeset.change(user, active: false))
      assert :error = Sessions.authenticate(token, at(1))
    end

    test "refuses a device account even with a session row" do
      {device, _} = tablet()
      {token, _} = Sessions.create(device, [], @t0)
      assert :error = Sessions.authenticate(token, at(1))
    end

    test "a normal session has no idle limit" do
      user = user_fixture()
      {token, _} = Sessions.create(user, [], @t0)
      assert {:ok, _, _} = Sessions.authenticate(token, at(20 * 24 * 3600))
    end
  end

  describe "revoke_all/3" do
    test "revokes every other session and keeps the one named" do
      user = user_fixture()
      other = user_fixture()
      {keep, keep_row} = Sessions.create(user, [], @t0)
      {a, _} = Sessions.create(user, [], @t0)
      {b, _} = Sessions.create(user, [], @t0)
      {theirs, _} = Sessions.create(other, [], @t0)

      assert Sessions.revoke_all(user, keep_row, at(5)) == 2

      assert {:ok, _, _} = Sessions.authenticate(keep, at(6))
      assert :error = Sessions.authenticate(a, at(6))
      assert :error = Sessions.authenticate(b, at(6))
      assert {:ok, _, _} = Sessions.authenticate(theirs, at(6))
    end

    test "with no session to keep, revokes them all" do
      user = user_fixture()
      {a, _} = Sessions.create(user, [], @t0)
      assert Sessions.revoke_all(user, nil, at(1)) == 1
      assert :error = Sessions.authenticate(a, at(2))
    end

    test "revoke/2 twice is harmless" do
      user = user_fixture()
      {_, row} = Sessions.create(user, [], @t0)
      assert :ok = Sessions.revoke(row, at(1))
      assert :ok = Sessions.revoke(row, at(2))
      assert Repo.get!(UserSession, row.id).revoked_at == at(1)
    end
  end
end
