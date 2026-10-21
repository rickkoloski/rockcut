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
    ramp_flat: "The start and target temperatures are the same.",
    # D47: batches and steps.
    range_invalid: "Pick a range of 7 to 730 days.",
    template_incomplete: "That template is incomplete. Finish it under Set up → Templates first.",
    tank_invalid: "That tank isn't available. Pick another or leave it unassigned.",
    volume_invalid: "Enter a volume more than 0 and under 10,000 bbl.",
    not_planned: "Only a planned batch can be deleted.",
    not_brewed: "A planned batch gets its number when brew day is checked off.",
    batch_number_required: "Enter the batch number.",
    batch_number_invalid: "A batch number is 1 to 20 characters.",
    days_invalid: "Move by whole days, up to a year.",
    answer_invalid: "Answer “move all” or “move only”.",
    step_done: "That step is already done. Mark it not done first.",
    not_done: "That step isn't done.",
    done_on_invalid: "Enter the day it was done.",
    done_on_future: "A step can't be done in the future.",
    assignee_invalid: "Steps can be assigned to Brewery members only.",
    undo_expired: "It's too late to undo that."
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

  # D47: "#40 is already Galactic #40."
  def handle({:error, {:batch_number_taken, number, other}}, conn) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "batch_number_taken", message: "##{number} is already #{other}."})
  end

  # D47: an off-plan move or check-off with steps following needs an answer;
  # the preview is what the prompt shows.
  def handle({:error, {:answer_required, preview}}, conn) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "answer_required",
      message: "Choose whether the following steps move too.",
      preview: preview
    })
  end

  # D47 plan decision 5.
  def handle({:error, :undo_stale}, conn) do
    conn
    |> put_status(:conflict)
    |> json(%{error: "undo_stale", message: "Something changed since. Nothing was undone."})
  end

  def handle({:error, code}, conn) when is_map_key(@messages, code) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: Atom.to_string(code), message: Map.fetch!(@messages, code)})
  end
end
