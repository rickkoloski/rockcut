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
      assert is_nil(row.device_token_id)
    end

    test "a tablet session: marked, 12 hours" do
      user = user_fixture()
      {_device, dt} = tablet()
      {_token, row} = Sessions.create(user, [device_token: dt], @t0)

      assert row.device_token_id == dt.id
      assert row.expires_at == at(12 * 3600)
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
    test "accepts a live session and touches last_seen_at at most once a minute" do
      user = user_fixture()
      {token, row} = Sessions.create(user, [], @t0)

      assert {:ok, %{id: id}, _} = Sessions.authenticate(token, at(10))
      assert id == user.id
      assert Repo.get!(UserSession, row.id).last_seen_at == at(10)

      Sessions.authenticate(token, at(40))
      assert Repo.get!(UserSession, row.id).last_seen_at == at(10)

      Sessions.authenticate(token, at(70))
      assert Repo.get!(UserSession, row.id).last_seen_at == at(70)
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

    test "a tablet session dies after 15 minutes without a request (Q2)" do
      user = user_fixture()
      {_device, dt} = tablet()
      {token, _} = Sessions.create(user, [device_token: dt], @t0)

      assert {:ok, _, _} = Sessions.authenticate(token, at(14 * 60))
      # Seen at 14:00, so it lives until 29:00.
      assert {:ok, _, _} = Sessions.authenticate(token, at(28 * 60 + 59))
      assert :error = Sessions.authenticate(token, at(28 * 60 + 59 + 15 * 60))
    end

    test "an unused tablet session dies 15 minutes after sign-in" do
      user = user_fixture()
      {_device, dt} = tablet()
      {token, _} = Sessions.create(user, [device_token: dt], @t0)
      assert :error = Sessions.authenticate(token, at(15 * 60))
    end

    test "a tablet session never outlives 12 hours, even when busy" do
      user = user_fixture()
      {_device, dt} = tablet()
      {token, _} = Sessions.create(user, [device_token: dt], @t0)

      for minute <- 1..(12 * 60 - 1)//10,
          do: assert({:ok, _, _} = Sessions.authenticate(token, at(minute * 60)))

      assert :error = Sessions.authenticate(token, at(12 * 3600))
    end

    test "a normal session has no idle limit" do
      user = user_fixture()
      {token, _} = Sessions.create(user, [], @t0)
      assert {:ok, _, _} = Sessions.authenticate(token, at(20 * 24 * 3600))
    end
  end

  describe "tablet revocation ends its sessions (A5)" do
    setup do
      user = user_fixture()
      owner = owner_fixture()
      {device, dt} = tablet()
      # Real time here: the D33 revoke paths stamp the current time.
      {on_tablet, row} = Sessions.create(user, device_token: dt)
      {on_phone, _} = Sessions.create(user)
      assert {:ok, _, _} = Sessions.authenticate(on_tablet)
      %{owner: owner, device: device, dt: dt, on_tablet: on_tablet, row: row, on_phone: on_phone}
    end

    test "revoking the tablet token", c do
      {:ok, _} = Devices.revoke_token(c.dt, c.owner)
      assert :error = Sessions.authenticate(c.on_tablet)
      assert Repo.get!(UserSession, c.row.id).revoked_at
      assert {:ok, _, _} = Sessions.authenticate(c.on_phone)
    end

    test "deactivating the device", c do
      {:ok, _} = Devices.update_device(c.device, %{active: false}, c.owner)
      assert :error = Sessions.authenticate(c.on_tablet)
      assert Repo.get!(UserSession, c.row.id).revoked_at
      assert {:ok, _, _} = Sessions.authenticate(c.on_phone)
    end

    test "deleting the device", c do
      {:ok, _} = Devices.delete_device(c.device, c.owner)
      assert :error = Sessions.authenticate(c.on_tablet)
      refute Repo.get(UserSession, c.row.id)
      assert {:ok, _, _} = Sessions.authenticate(c.on_phone)
    end

    test "a token revoked behind the context's back still ends the session", c do
      Repo.update!(
        Ecto.Changeset.change(c.dt, revoked_at: DateTime.truncate(DateTime.utc_now(), :second))
      )

      assert :error = Sessions.authenticate(c.on_tablet)
    end
  end

  describe "revoke_all/3" do
    test "revokes every other session, keeps the one named, and cuts off legacy tokens" do
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
      assert Sessions.legacy_tokens_revoked?(Repo.reload!(user))
      refute Sessions.legacy_tokens_revoked?(Repo.reload!(other))
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
