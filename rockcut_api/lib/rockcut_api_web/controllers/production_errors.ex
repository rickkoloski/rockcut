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
    ramp_invalid:
      "Enter start and target temperatures from 28 to 80°F, a change per day of at least 1°, and a first day.",
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

  def handle({:error, code}, conn) when is_map_key(@messages, code) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: Atom.to_string(code), message: Map.fetch!(@messages, code)})
  end
end
