defmodule RockcutApi.StaffCodes.RateLimiter do
  @moduledoc """
  Limits wrong staff codes per shared-device token (D37 §3.2): the
  `limit`-th (5) wrong code within `window` (10 minutes) locks code entry on
  that tablet for `lock` (10 minutes). A locked tablet is refused before its
  code is checked, so even a right code waits out the lock.

  A wrong-code burst comes from one tablet at a bar, so calls go through the
  GenServer (serialized) rather than D33's lock-free ETS counters. State is
  per API machine and resets on restart: fine while prod runs one machine
  (D28). Limits come from `config :rockcut_api, #{inspect(__MODULE__)}`
  (`limit:`, `window_seconds:`, `lock_seconds:`); config/dev.exs raises `limit` for
  local Playwright reruns.
  """
  use GenServer

  def start_link(_opts), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  def limit, do: setting(:limit, 5)
  def window_seconds, do: setting(:window_seconds, 10 * 60)
  def lock_seconds, do: setting(:lock_seconds, 10 * 60)

  @doc "`:ok`, or `{:locked, seconds_left}` while `key`'s tablet is locked."
  def check(key, now \\ now()), do: GenServer.call(__MODULE__, {:check, key, now})

  @doc """
  Record a wrong code for `key`. Returns `:ok`, or `{:locked, seconds_left}`
  when this one used up the limit.
  """
  def failure(key, now \\ now()), do: GenServer.call(__MODULE__, {:failure, key, now})

  @doc "Forget every counter and lock (tests)."
  def reset, do: GenServer.call(__MODULE__, :reset)

  @impl true
  def init(:ok) do
    schedule_sweep()
    {:ok, %{}}
  end

  # State: %{key => %{failures: [unix_seconds], locked_until: unix_seconds | nil}}
  @impl true
  def handle_call({:check, key, now}, _from, state) do
    {:reply, lock_status(Map.get(state, key), now), state}
  end

  def handle_call({:failure, key, now}, _from, state) do
    entry = Map.get(state, key, %{failures: [], locked_until: nil})

    case lock_status(entry, now) do
      {:locked, _} = locked ->
        {:reply, locked, state}

      :ok ->
        failures = [now | recent(entry.failures, now)]

        entry =
          if length(failures) >= limit(),
            do: %{failures: [], locked_until: now + lock_seconds()},
            else: %{failures: failures, locked_until: nil}

        {:reply, lock_status(entry, now), Map.put(state, key, entry)}
    end
  end

  def handle_call(:reset, _from, _state), do: {:reply, :ok, %{}}

  @impl true
  def handle_info(:sweep, state) do
    now = now()

    state =
      state
      |> Enum.map(fn {k, e} -> {k, %{e | failures: recent(e.failures, now)}} end)
      |> Enum.reject(fn {_k, e} -> e.failures == [] and lock_status(e, now) == :ok end)
      |> Map.new()

    schedule_sweep()
    {:noreply, state}
  end

  defp lock_status(%{locked_until: until}, now) when is_integer(until) and until > now,
    do: {:locked, until - now}

  defp lock_status(_entry, _now), do: :ok

  defp recent(failures, now), do: Enum.filter(failures, &(&1 > now - window_seconds()))

  defp schedule_sweep, do: Process.send_after(self(), :sweep, window_seconds() * 1000)

  defp setting(name, default),
    do: Application.get_env(:rockcut_api, __MODULE__, []) |> Keyword.get(name, default)

  defp now, do: System.system_time(:second)
end
