defmodule RockcutApiWeb.IdeaBoardErrors do
  @moduledoc """
  D53 Part 2: how the Idea Board controllers answer a refused action. A
  board this person can't open (or a write a tablet tries) is 403; a list,
  card or other id not on this board is 404. A lock that stops a
  non-manager is 423 (`locked`, or `holds_locked_card` for archiving a list
  with a locked card in it, §4.5). A rule the board enforces is 422 with a
  code. A changeset goes to `FallbackController`.
  """
  import Plug.Conn, only: [put_status: 2]
  import Phoenix.Controller, only: [json: 2]

  @messages %{
    locked: "Locked by a manager",
    holds_locked_card: "This list holds a locked card, so only a manager can archive it",
    restore_holds_locked_card: "This list holds a locked card, so only a manager can restore it",
    archived: "That's archived. Restore it first",
    list_archived: "Its list is archived. Restore the list first",
    not_archived: "Archive it first",
    invalid_order: "The list changed. Reload and try again",
    department_required: "Choose a task board",
    repeat_per_item: "Repeat works with one task only",
    no_open_items: "The checklist has no open items",
    invalid_checklist_mode: "Choose how the checklist goes",
    invalid_then: "Choose what happens to the card",
    repeat_needs_day: "Pick a day to repeat"
  }

  @doc "Pass a conn through; turn `{:error, reason}` into a response."
  def handle(%Plug.Conn{} = conn, _conn), do: conn
  def handle({:error, %Ecto.Changeset{}} = error, _conn), do: error

  def handle({:error, :forbidden}, conn),
    do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})

  def handle({:error, :not_found}, conn),
    do: conn |> put_status(:not_found) |> json(%{error: "not_found", message: "Not found"})

  def handle({:error, code}, conn) when code in [:locked, :holds_locked_card],
    do: conn |> put_status(:locked) |> json(%{error: to_string(code), message: @messages[code]})

  # Restoring such a list (fix cycle 1, gap 4): the same code, its own words.
  def handle({:error, :restore_holds_locked_card}, conn) do
    conn
    |> put_status(:locked)
    |> json(%{error: "holds_locked_card", message: @messages[:restore_holds_locked_card]})
  end

  def handle({:error, code}, conn) when is_map_key(@messages, code) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: to_string(code), message: @messages[code]})
  end
end
