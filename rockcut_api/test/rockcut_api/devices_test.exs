defmodule RockcutApi.DevicesTest do
  @moduledoc "D33 §3.2: pairing codes, tablet tokens, rate limiting."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures
  import Ecto.Query, only: [from: 2]

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

    test "codes come from the OS CSPRNG, not :rand (review item 1)", %{device: d, owner: o} do
      # With :rand, the same seed gives the same code; crypto randomness ignores it.
      :rand.seed(:exsss, {1, 2, 3})
      {:ok, first, _} = Devices.create_pairing_code(d, o)
      :rand.seed(:exsss, {1, 2, 3})
      {:ok, second, _} = Devices.create_pairing_code(d, o)
      refute first == second
    end

    test "every alphabet character turns up (no truncated alphabet)", %{device: d, owner: o} do
      chars =
        for _ <- 1..60, reduce: MapSet.new() do
          acc ->
            {:ok, code, _} = Devices.create_pairing_code(d, o)

            code
            |> String.replace("-", "")
            |> String.graphemes()
            |> MapSet.new()
            |> MapSet.union(acc)
        end

      assert MapSet.size(chars) == 31
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

  describe "write lock (review item 4)" do
    defp queries_during(fun) do
      me = self()
      id = "q-#{System.unique_integer([:positive])}"

      :telemetry.attach(
        id,
        [:rockcut_api, :repo, :query],
        fn _, _, meta, _ ->
          send(me, {:query, meta.query})
        end,
        nil
      )

      try do
        fun.()
      after
        :telemetry.detach(id)
      end

      collect([])
    end

    defp collect(acc) do
      receive do
        {:query, q} -> collect([q | acc])
      after
        0 -> Enum.reverse(acc)
      end
    end

    test "a wrong code opens no transaction", %{device: d, owner: o} do
      {:ok, _code, _} = Devices.create_pairing_code(d, o)

      qs =
        queries_during(fn ->
          {:error, :invalid_code} = Devices.exchange_code("WRONGONE", "x", ip())
        end)

      refute "begin" in qs, inspect(qs)
    end

    test "a used code opens no transaction", %{device: d, owner: o} do
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      {:ok, _, _} = Devices.exchange_code(code, "iPad 1", ip())

      qs =
        queries_during(fn ->
          {:error, :invalid_code} = Devices.exchange_code(code, "iPad 2", ip())
        end)

      refute "begin" in qs, inspect(qs)
    end

    test "a live code still pairs inside a transaction", %{device: d, owner: o} do
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      qs = queries_during(fn -> {:ok, _, _} = Devices.exchange_code(code, "iPad", ip()) end)
      assert "begin" in qs
    end

    test "two tablets racing for one code: exactly one token", %{device: d, owner: o} do
      {:ok, code, _} = Devices.create_pairing_code(d, o)

      results =
        1..4
        |> Enum.map(fn n ->
          Task.async(fn -> Devices.exchange_code(code, "iPad #{n}", ip()) end)
        end)
        |> Enum.map(&Task.await/1)

      assert Enum.count(results, &match?({:ok, _, _}, &1)) == 1
      assert Repo.aggregate(DeviceToken, :count) == 1
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

    test "deactivating revokes every tablet; reactivating needs new pairings (DEV G1)", %{
      device: d,
      owner: o
    } do
      t1 = device_token_fixture(d, "iPad 1")
      t2 = device_token_fixture(d, "iPad 2")
      {:ok, _code, _} = Devices.create_pairing_code(d, o)

      {:ok, _} = Devices.update_device(d, %{"active" => false}, o)
      assert Repo.all(DeviceToken) |> Enum.all?(&(&1.revoked_at != nil))
      assert Repo.all(from(pc in PairingCode, where: is_nil(pc.used_at))) == []

      {:ok, _} =
        Devices.update_device(Repo.get!(RockcutApi.Accounts.User, d.id), %{"active" => true}, o)

      assert :error = Devices.authenticate_token(t1)
      assert :error = Devices.authenticate_token(t2)

      # A new pairing works after reactivation.
      {:ok, code, _} = Devices.create_pairing_code(d, o)
      assert {:ok, t3, _} = Devices.exchange_code(code, "iPad 3", ip())
      assert {:ok, _, _} = Devices.authenticate_token(t3)
    end

    test "renaming leaves tablets alone", %{device: d, owner: o} do
      t1 = device_token_fixture(d, "iPad 1")
      {:ok, _} = Devices.update_device(d, %{"name" => "Front bar"}, o)
      assert {:ok, _, _} = Devices.authenticate_token(t1)
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
