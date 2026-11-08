defmodule RockcutApiWeb.IdeaBoardErrors do
  @moduledoc """
  D53 Part 2: how the Idea Board controllers answer a refused action. A
  board this person can't open (or a write a tablet tries) is 403; a list,
  card or other id not on this board is 404. A changeset goes to
  `FallbackController`.
  """
  import Plug.Conn, only: [put_status: 2]
  import Phoenix.Controller, only: [json: 2]

  @doc "Pass a conn through; turn `{:error, reason}` into a response."
  def handle(%Plug.Conn{} = conn, _conn), do: conn
  def handle({:error, %Ecto.Changeset{}} = error, _conn), do: error

  def handle({:error, :forbidden}, conn),
    do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})

  def handle({:error, :not_found}, conn),
    do: conn |> put_status(:not_found) |> json(%{error: "not_found", message: "Not found"})
end
