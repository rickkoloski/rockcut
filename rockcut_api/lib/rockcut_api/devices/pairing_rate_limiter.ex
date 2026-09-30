defmodule RockcutApi.Devices.PairingRateLimiter do
  @moduledoc """
  At most #{5} wrong pairing codes per client IP per 10-minute window (D33 §3.2).

  A fixed window in a public ETS table owned by this process. The table is
  per API machine, which is fine while prod runs one machine (D28).
  """
  use GenServer

  @table __MODULE__
  @max_failures 5
  @window_seconds 10 * 60

  def start_link(_opts), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "True when `ip` has used up its wrong-code allowance in the current window."
  def limited?(ip, now \\ now()) do
    case :ets.lookup(@table, ip) do
      [{^ip, count, window_start}] when now - window_start < @window_seconds ->
        count >= @max_failures

      _ ->
        false
    end
  end

  @doc "Count one wrong code for `ip`."
  def record_failure(ip, now \\ now()) do
    case :ets.lookup(@table, ip) do
      [{^ip, count, window_start}] when now - window_start < @window_seconds ->
        :ets.insert(@table, {ip, count + 1, window_start})

      _ ->
        :ets.insert(@table, {ip, 1, now})
    end

    :ok
  end

  @doc "Forget every counter (tests)."
  def reset, do: :ets.delete_all_objects(@table)

  def max_failures, do: @max_failures
  def window_seconds, do: @window_seconds

  @impl true
  def init(:ok) do
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    {:ok, nil}
  end

  defp now, do: System.system_time(:second)
end
