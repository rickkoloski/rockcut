defmodule RockcutApi.StaffCodes.RateLimiterTest do
  @moduledoc "D37 §3.2: wrong staff codes lock a tablet's code entry (S9)."
  use ExUnit.Case, async: false

  alias RockcutApi.StaffCodes.RateLimiter

  setup do
    RateLimiter.reset()
    :ok
  end

  @t 1_000_000

  test "the 5th wrong code within 10 minutes locks the tablet for 10 minutes" do
    for i <- 1..4, do: assert(RateLimiter.failure(:tablet, @t + i) == :ok)
    assert RateLimiter.check(:tablet, @t + 5) == :ok

    assert {:locked, 600} = RateLimiter.failure(:tablet, @t + 5)
    assert {:locked, 300} = RateLimiter.check(:tablet, @t + 305)
    # A locked tablet stays locked whatever is typed, and failures don't extend it.
    assert {:locked, 300} = RateLimiter.failure(:tablet, @t + 305)
    assert RateLimiter.check(:tablet, @t + 605) == :ok
  end

  test "after the lock the count starts again" do
    for i <- 1..5, do: RateLimiter.failure(:tablet, @t + i)
    for i <- 1..4, do: assert(RateLimiter.failure(:tablet, @t + 700 + i) == :ok)
    assert {:locked, _} = RateLimiter.failure(:tablet, @t + 705)
  end

  test "wrong codes older than 10 minutes don't count" do
    for i <- 1..4, do: RateLimiter.failure(:tablet, @t + i)
    assert RateLimiter.failure(:tablet, @t + 601) == :ok
    assert RateLimiter.check(:tablet, @t + 601) == :ok
  end

  test "each tablet has its own count" do
    for i <- 1..5, do: RateLimiter.failure(:tablet_a, @t + i)
    assert {:locked, _} = RateLimiter.check(:tablet_a, @t + 6)
    assert RateLimiter.check(:tablet_b, @t + 6) == :ok
    assert RateLimiter.failure(:tablet_b, @t + 6) == :ok
  end
end
