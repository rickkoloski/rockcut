defmodule RockcutApi.Devices.PairingRateLimiter do
  @moduledoc """
  Limits wrong pairing codes (D33 §3.2, hardened after review item 5):

    * at most `per_ip` (5) attempts per client per 10-minute window, where the
      client is an IPv4 address or an IPv6 **/64** (one holder has the whole
      /64, so a per-address count would be no limit);
    * at most `global` (50) wrong codes per window across **all** clients, so
      rotating addresses doesn't help either. Real pairing is rare.

  Attempts are counted atomically with `:ets.update_counter/4` *before* the
  code is checked, so a concurrent burst can't slip past the limit; a
  successful pairing is refunded. Windows are fixed (`div(now, 600)`) and part
  of the key; rows from past windows are swept every window, so the table
  stays small whatever addresses are used.

  The table is per API machine and resets on restart: fine while prod runs one
  machine (D28). Limits come from `config :rockcut_api, #{inspect(__MODULE__)}`
  (`per_ip:`, `global:`); the local dev server raises `per_ip` (config/dev.exs)
  because local Playwright reruns all come from 127.0.0.1.
  """
  use GenServer

  @table __MODULE__
  @window_seconds 10 * 60

  def start_link(_opts), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  def window_seconds, do: @window_seconds
  def per_ip_limit, do: limit(:per_ip, 5)
  def global_limit, do: limit(:global, 50)

  @doc """
  The limiter key for a client address: an `:inet` tuple or a string. IPv6 is
  keyed by its /64 and IPv4-mapped IPv6 as IPv4. Unparseable input is kept
  as-is (it's still one bucket).
  """
  def key({_, _, _, _} = v4), do: {:v4, v4}

  def key({0, 0, 0, 0, 0, 0xFFFF, hi, lo}),
    do: key({div(hi, 256), rem(hi, 256), div(lo, 256), rem(lo, 256)})

  def key({a, b, c, d, _, _, _, _}), do: {:v6_64, {a, b, c, d}}

  def key(ip) when is_binary(ip) do
    case ip |> String.trim() |> String.to_charlist() |> :inet.parse_address() do
      {:ok, addr} -> key(addr)
      {:error, _} -> {:raw, ip}
    end
  end

  @doc """
  Count one attempt for `key` (per client, then globally). Returns `:ok`, or
  `:rate_limited` when either limit is already used up. A limited attempt
  doesn't use the global budget.
  """
  def count_attempt(key, now \\ now()) do
    w = window(now)
    client = {:client, key, w}

    if bump(client, 1) > per_ip_limit() do
      :rate_limited
    else
      if bump({:global, w}, 1) > global_limit(), do: :rate_limited, else: :ok
    end
  end

  @doc "Give back an attempt that turned out to be a successful pairing."
  def refund(key, now \\ now()) do
    w = window(now)
    bump({:client, key, w}, -1)
    bump({:global, w}, -1)
    :ok
  end

  @doc "Delete counters from windows before the one `now` falls in."
  def sweep(now \\ now()) do
    current = window(now)

    :ets.select_delete(@table, [
      {{{:client, :_, :"$1"}, :_}, [{:<, :"$1", current}], [true]},
      {{{:global, :"$1"}, :_}, [{:<, :"$1", current}], [true]}
    ])

    :ok
  end

  @doc "Number of counter rows (tests)."
  def size, do: :ets.info(@table, :size)

  @doc "Forget every counter (tests)."
  def reset, do: :ets.delete_all_objects(@table)

  @impl true
  def init(:ok) do
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    schedule_sweep()
    {:ok, nil}
  end

  @impl true
  def handle_info(:sweep, state) do
    sweep()
    schedule_sweep()
    {:noreply, state}
  end

  defp schedule_sweep, do: Process.send_after(self(), :sweep, @window_seconds * 1000)

  defp bump(row_key, by), do: :ets.update_counter(@table, row_key, {2, by}, {row_key, 0})

  defp window(now), do: div(now, @window_seconds)

  defp limit(name, default),
    do: Application.get_env(:rockcut_api, __MODULE__, []) |> Keyword.get(name, default)

  defp now, do: System.system_time(:second)
end
