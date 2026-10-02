defmodule RockcutApi.Devices.PairingRateLimiterTest do
  @moduledoc "D33 review item 5: the wrong-code limiter (per IP or /64, global cap, atomic, swept)."
  use RockcutApi.DataCase, async: false

  import RockcutApi.AccountsFixtures

  alias RockcutApi.Devices
  alias RockcutApi.Devices.PairingRateLimiter, as: Limiter

  setup do
    Limiter.reset()
    %{device: device_fixture(), owner: owner_fixture()}
  end

  describe "client keys" do
    test "IPv4 is keyed by address" do
      assert Limiter.key({10, 1, 2, 3}) == Limiter.key("10.1.2.3")
      refute Limiter.key("10.1.2.3") == Limiter.key("10.1.2.4")
    end

    test "IPv6 is keyed by its /64" do
      a = Limiter.key("2001:db8:1:2:aaaa::1")
      b = Limiter.key("2001:db8:1:2:ffff:ffff:ffff:ffff")
      c = Limiter.key("2001:db8:1:3::1")
      assert a == b
      refute a == c
    end

    test "IPv4-mapped IPv6 is keyed as IPv4" do
      assert Limiter.key({0, 0, 0, 0, 0, 0xFFFF, 0x0A01, 0x0203}) == Limiter.key("10.1.2.3")
    end

    test "rotating addresses inside one /64 doesn't dodge the limit" do
      for n <- 1..5 do
        assert {:error, :invalid_code} = Devices.exchange_code("WRONGONE", "x", "2001:db8::#{n}")
      end

      assert {:error, :rate_limited} = Devices.exchange_code("WRONGONE", "x", "2001:db8::99")
    end
  end

  test "a concurrent burst from one IP gets exactly 5 tries" do
    results =
      1..20
      |> Enum.map(fn _ ->
        Task.async(fn -> Devices.exchange_code("WRONGONE", "x", "10.7.7.7") end)
      end)
      |> Enum.map(&Task.await/1)

    assert Enum.count(results, &(&1 == {:error, :invalid_code})) == 5
    assert Enum.count(results, &(&1 == {:error, :rate_limited})) == 15
  end

  test "a global cap of 50 wrong codes per window, across all IPs", %{device: d, owner: o} do
    for n <- 1..50 do
      assert {:error, :invalid_code} =
               Devices.exchange_code("WRONGONE", "x", "10.8.#{div(n, 250)}.#{rem(n, 250)}")
    end

    assert {:error, :rate_limited} = Devices.exchange_code("WRONGONE", "x", "10.9.0.1")
    {:ok, code, _} = Devices.create_pairing_code(d, o)
    assert {:error, :rate_limited} = Devices.exchange_code(code, "iPad", "10.9.0.2")
  end

  test "a successful pairing doesn't count against the IP", %{device: d, owner: o} do
    for _ <- 1..4,
        do: {:error, :invalid_code} = Devices.exchange_code("WRONGONE", "x", "10.6.6.6")

    {:ok, code, _} = Devices.create_pairing_code(d, o)
    assert {:ok, _, _} = Devices.exchange_code(code, "iPad", "10.6.6.6")
    assert {:error, :invalid_code} = Devices.exchange_code("WRONGONE", "x", "10.6.6.6")
    assert {:error, :rate_limited} = Devices.exchange_code("WRONGONE", "x", "10.6.6.6")
  end

  test "counters reset with the window and expired rows are swept" do
    t0 = System.system_time(:second)
    key = Limiter.key("10.5.5.5")
    for _ <- 1..5, do: assert(:ok == Limiter.count_attempt(key, t0))
    assert :rate_limited == Limiter.count_attempt(key, t0 + 1)
    assert Limiter.size() > 0

    later = t0 + Limiter.window_seconds()
    :ok = Limiter.sweep(later)
    assert Limiter.size() == 0
    assert :ok == Limiter.count_attempt(key, later)
  end
end
