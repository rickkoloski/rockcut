defmodule RockcutApi.BreweryTasks do
  @moduledoc """
  The Brewery task board (D38): tasks planned on days or on the Future list,
  the Daily card, and the change log (`brewery_task_events`). Which cards show
  on a day is decided only by `Placement`.

  "Today" is the Colorado date, never the server's (Fly runs in UTC). Every
  function that needs it takes it as an optional argument so tests can pin it.
  """

  alias RockcutApi.Scheduling.Recurrence

  @doc "Today's date in Colorado."
  def today, do: today_at(DateTime.utc_now())

  @doc "The Colorado date at the instant `now` (any time zone)."
  def today_at(%DateTime{} = now) do
    now |> DateTime.shift_zone!(Recurrence.zone()) |> DateTime.to_date()
  end
end
