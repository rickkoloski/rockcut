defmodule RockcutApi.Reminders.Scheduler do
  @moduledoc """
  Lightweight periodic scanner (D22): ticks on an interval and asks
  `RockcutApi.Reminders.run/0` to send any due shift reminders. Single supervised
  process; the scan itself is idempotent. Disabled in :test.

  D39: each tick also tops up recurring Brewery tasks to today + 12 months
  (`BreweryTasks.Series.top_up/1`; a no-op after the day's first run). Each job
  is rescued on its own, so one failing never stops the other.
  """
  use GenServer
  require Logger
  alias RockcutApi.{BreweryTasks, Reminders}

  @default_interval_ms 300_000

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @impl true
  def init(_opts) do
    if enabled?() do
      schedule_tick()
      {:ok, %{}}
    else
      :ignore
    end
  end

  @impl true
  def handle_info(:tick, state) do
    try do
      Reminders.run()
    rescue
      e -> Logger.error("reminder scan failed: #{inspect(e)}")
    end

    try do
      BreweryTasks.Series.top_up(BreweryTasks.today())
    rescue
      e -> Logger.error("recurring task top-up failed: #{inspect(e)}")
    end

    schedule_tick()
    {:noreply, state}
  end

  defp schedule_tick, do: Process.send_after(self(), :tick, interval_ms())

  defp config, do: Application.get_env(:rockcut_api, __MODULE__, [])
  defp enabled?, do: Keyword.get(config(), :enabled, true)
  defp interval_ms, do: Keyword.get(config(), :interval_ms, @default_interval_ms)
end
