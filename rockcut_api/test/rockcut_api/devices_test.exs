defmodule RockcutApi.DevicesTest do
  @moduledoc "D33 §3.2: pairing codes, tablet tokens, rate limiting."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures

  alias RockcutApi.{Devices, Repo}
  alias RockcutApi.Accounts.AuditEntry
  alias RockcutApi.Devices.{DeviceToken, PairingCode, PairingRateLimiter}

  setup do
    PairingRateLimiter.reset()
    %{device: device_fixture(), owner: owner_fixture()}
  end

  defp ip, do: "10.0.0.#{System.unique_integer([:positive])}"

  describe "pairing codes" do
    test "8 characters from the no-look-alike alphabet, shown as XXXX-XXXX", %{
      device: d,
      owner: o
    } do
      for _ <- 1..20 do
        {:ok, code, _exp} = Devices.create_pairing_code(d, o)
        assert code =~ ~r/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/
      end
    end

    test "stored hashed, never in plain text", %{device: d, owner: o} do
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      [row] = Repo.all(PairingCode)
      refute row.code_hash == code
      refute row.code_hash == Devices.normalize_code(code)
      assert row.code_hash == Devices.hash(Devices.normalize_code(code))
    end

    test "exchange returns a dev_ token once; the code is single use (S4)", %{device: d, owner: o} do
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      assert {:ok, "dev_" <> _ = token, row} = Devices.exchange_code(code, "Taproom iPad 1", ip())
      assert row.name == "Taproom iPad 1"
      assert row.paired_by_id == o.id
      assert row.token_hash == Devices.hash(token)
      assert {:error, :invalid_code} = Devices.exchange_code(code, "Again", ip())
    end

    test "codes are case- and dash-insensitive", %{device: d, owner: o} do
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      typed = code |> String.downcase() |> String.replace("-", " ")
      assert {:ok, _, _} = Devices.exchange_code(typed, "iPad", ip())
    end

    test "codes expire after 10 minutes (S4)", %{device: d, owner: o} do
      past = DateTime.utc_now() |> DateTime.add(-11 * 60) |> DateTime.truncate(:second)
      {:ok, code, _} = Devices.create_pairing_code(d, o, past)
      assert {:error, :invalid_code} = Devices.exchange_code(code, "iPad", ip())
    end

    test "a second code leaves the first valid (lead decision 7)", %{device: d, owner: o} do
      {:ok, first, _} = Devices.create_pairing_code(d, o)
      {:ok, second, _} = Devices.create_pairing_code(d, o)
      assert {:ok, _, _} = Devices.exchange_code(first, "iPad 1", ip())
      assert {:ok, _, _} = Devices.exchange_code(second, "iPad 2", ip())
    end

    test "a wrong code and an inactive device are refused the same way", %{device: d, owner: o} do
      assert {:error, :invalid_code} = Devices.exchange_code("ABCD-EFGH", "iPad", ip())
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      {:ok, _} = Devices.update_device(d, %{"active" => false}, o)
      assert {:error, :invalid_code} = Devices.exchange_code(code, "iPad", ip())
    end

    test "a tablet name is required", %{device: d, owner: o} do
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      assert {:error, :invalid_name} = Devices.exchange_code(code, "   ", ip())
      assert {:ok, _, _} = Devices.exchange_code(code, "iPad", ip())
    end
  end

  describe "rate limit (S4)" do
    test "the 6th wrong code in the window is rate-limited, even a right one", %{
      device: d,
      owner: o
    } do
      addr = ip()

      for _ <- 1..5,
          do: assert({:error, :invalid_code} = Devices.exchange_code("WRONGONE", "x", addr))

      {:ok, code, _} = Devices.create_pairing_code(d, o)
      assert {:error, :rate_limited} = Devices.exchange_code(code, "iPad", addr)
      # Another IP isn't affected, and the code wasn't used up.
      assert {:ok, _, _} = Devices.exchange_code(code, "iPad", ip())
    end

    test "the window resets after 10 minutes" do
      addr = ip()
      t0 = System.system_time(:second)
      for _ <- 1..5, do: PairingRateLimiter.record_failure(addr, t0)
      assert PairingRateLimiter.limited?(addr, t0 + 1)
      refute PairingRateLimiter.limited?(addr, t0 + PairingRateLimiter.window_seconds())
    end
  end

  describe "tokens" do
    test "authenticate, revoke, deactivate", %{device: d, owner: o} do
      t1 = device_token_fixture(d, "iPad 1")
      t2 = device_token_fixture(d, "iPad 2")
      assert {:ok, %{id: id}, row1} = Devices.authenticate_token(t1)
      assert id == d.id

      {:ok, _} = Devices.revoke_token(row1, o)
      assert :error = Devices.authenticate_token(t1)
      assert {:ok, _, _} = Devices.authenticate_token(t2)

      {:ok, _} = Devices.update_device(d, %{"active" => false}, o)
      assert :error = Devices.authenticate_token(t2)
    end

    test "unknown or non-dev tokens don't authenticate" do
      assert :error = Devices.authenticate_token("dev_nope")
      assert :error = Devices.authenticate_token("SFMyNTY.whatever")
    end

    test "last_seen_at is touched at most once a minute", %{device: d} do
      token = device_token_fixture(d)
      t0 = ~U[2026-10-01 18:00:00Z]
      {:ok, _, _} = Devices.authenticate_token(token, t0)
      assert Repo.one!(DeviceToken).last_seen_at == t0

      {:ok, _, _} = Devices.authenticate_token(token, DateTime.add(t0, 30))
      assert Repo.one!(DeviceToken).last_seen_at == t0

      {:ok, _, _} = Devices.authenticate_token(token, DateTime.add(t0, 61))
      assert Repo.one!(DeviceToken).last_seen_at == DateTime.add(t0, 61)
    end
  end

  test "create, pair, revoke and deactivate are audited (S1)", %{owner: o} do
    {:ok, d} =
      Devices.create_device(
        %{"name" => "Front bar", "home_department_id" => department_fixture("bar").id},
        o
      )

    {:ok, code, _} = Devices.create_pairing_code(d, o)
    {:ok, _, row} = Devices.exchange_code(code, "iPad", ip())
    {:ok, _} = Devices.revoke_token(row, o)
    {:ok, _} = Devices.update_device(d, %{"active" => false}, o)

    actions =
      Repo.all(AuditEntry) |> Enum.filter(&(&1.target_id == d.id)) |> Enum.map(& &1.action)

    for a <-
          ~w(device.created device.pairing_code device.paired device.revoked device.deactivated),
        do: assert(a in actions)
  end

  test "deleting a device removes its tokens and codes", %{device: d, owner: o} do
    device_token_fixture(d)
    {:ok, _, _} = Devices.create_pairing_code(d, o)
    {:ok, :ok} = Devices.delete_device(d, o)
    assert Repo.all(DeviceToken) == []
    assert Repo.all(PairingCode) == []
  end
end
