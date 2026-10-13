defmodule RockcutApiWeb.BreweryErrors do
  @moduledoc """
  D38: how the Brewery task board's controllers answer a refused action. A
  rule the board enforces is a 422 with a code (as D37's board does); a
  missing task or item is a 404; a changeset goes to `FallbackController`
  (a repeat rule's errors too, D39, e.g. `errors.repeat`).
  """
  import Plug.Conn, only: [put_status: 2]
  import Phoenix.Controller, only: [json: 2]

  alias RockcutApi.BreweryTasks

  @messages %{
    display_required: "Choose where the finished task should show",
    future_day: "Daily checks can't be ticked for a future day",
    retired: "That Daily item was retired",
    not_yet_added: "That Daily item wasn't on the list that day",
    locked: "A finished task can't be moved",
    too_many_items: "The Daily card holds at most #{BreweryTasks.max_items()} items",
    invalid_order: "The list changed. Reload and try again",
    invalid_date: "Enter dates as YYYY-MM-DD",
    range_too_long: "Choose a range of 1 to #{BreweryTasks.max_range_days()} days",
    repeat_needs_day: "Pick a day to repeat",
    scope_required: "Choose Just this one or This and all following",
    not_in_series: "That task doesn't repeat"
  }

  @doc """
  Pass a conn through; turn `{:error, reason}` into a response. A changeset
  error is returned for the controller's `action_fallback`.
  """
  def handle(%Plug.Conn{} = conn, _conn), do: conn
  def handle({:error, %Ecto.Changeset{}} = error, _conn), do: error

  def handle({:error, :forbidden}, conn),
    do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})

  def handle({:error, :not_found}, conn),
    do: conn |> put_status(:not_found) |> json(%{error: "not_found", message: "Not found"})

  def handle({:error, code}, conn) when is_map_key(@messages, code) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: Atom.to_string(code), message: Map.fetch!(@messages, code)})
  end
end
