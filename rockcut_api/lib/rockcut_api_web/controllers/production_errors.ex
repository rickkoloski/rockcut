defmodule RockcutApiWeb.ProductionErrors do
  @moduledoc """
  D46: how the production controllers answer a refused action. A rule the
  setup enforces is a 422 `{error, message}`; a missing row 404; a
  changeset goes to `FallbackController`. An overlapping out-of-service
  period names the other one (`other_id`, `message`).
  """
  import Plug.Conn, only: [put_status: 2]
  import Phoenix.Controller, only: [json: 2]

  alias RockcutApi.Production

  @messages %{
    invalid_order: "The list changed. Reload and try again.",
    outage_not_current: "That period isn't going on today.",
    built_in: "Built-in step types can't be retired.",
    retired: "That was retired. Restore it first.",
    one_brew_day: "A template has exactly one Brew day.",
    brew_day_fixed: "Brew day stays on day 0 in the first tank and can't be removed.",
    transfer_not_new_tank: "A transfer moves the beer into a new tank.",
    no_such_tank: "That tank doesn't exist yet. Add the Transfer or Filter into it first.",
    link_cycle: "That link would go in a circle.",
    link_order: "A step can't come before the step it follows.",
    link_exists: "Those steps are already linked.",
    ramp_invalid: "Start and target are whole degrees from 28 to 80°F.",
    ramp_days: "The first day is 0 or later, and the ramp ends by day 365.",
    ramp_flat: "The start and target temperatures are the same."
  }

  def handle(%Plug.Conn{} = conn, _conn), do: conn
  def handle({:error, %Ecto.Changeset{}} = error, _conn), do: error

  def handle({:error, :forbidden}, conn),
    do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})

  def handle({:error, :not_found}, conn),
    do: conn |> put_status(:not_found) |> json(%{error: "not_found", message: "Not found"})

  def handle({:error, :outage_overlap, other}, conn) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "outage_overlap",
      message:
        "That overlaps another period (#{Production.period_label(other)}). Change that one instead.",
      other_id: other.id
    })
  end

  def handle({:error, :tank_in_use, batches}, conn) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "tank_in_use",
      message:
        "Unfinished steps are planned in this tank: #{Enum.map_join(batches, ", ", & &1.label)}. Move them first.",
      batches: batches
    })
  end

  # D47 task 0 (N1): transfers stay in day order.
  def handle({:error, {:transfer_order, side, day}}, conn) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "transfer_order",
      message:
        "Transfers stay in day order: this one would come #{side} the transfer on day #{day}.",
      day: day
    })
  end

  # D47 task 0 (N3): the most a ramp can change per day is the whole gap.
  def handle({:error, {:ramp_change, gap}}, conn) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "ramp_change",
      message:
        "The change per day is a whole number of degrees from 1 to #{gap}° (the gap between start and target).",
      max: gap
    })
  end

  def handle({:error, code}, conn) when is_map_key(@messages, code) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: Atom.to_string(code), message: Map.fetch!(@messages, code)})
  end
end
