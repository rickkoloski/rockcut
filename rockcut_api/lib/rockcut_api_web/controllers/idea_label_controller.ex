defmodule RockcutApiWeb.IdeaLabelController do
  @moduledoc """
  D53 Part 2: an Idea Board's labels (decision 16), under
  `/api/idea_boards/:board/labels`. Anyone on the board adds one
  (`:write`); renaming, recoloring and deleting are `:manage` (on the
  Company board, owners). People only.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [idea_label: 1]
  import RockcutApiWeb.IdeaBoardAccess

  alias RockcutApi.IdeaBoards.Labels
  alias RockcutApiWeb.IdeaBoardErrors

  action_fallback RockcutApiWeb.FallbackController

  def create(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, label} <-
           Labels.create(board(conn), Map.take(params, ~w(name color)), current_user(conn)) do
      conn |> put_status(:created) |> json(%{data: idea_label(label)})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :manage),
         {:ok, label} <- Labels.fetch(board(conn), id),
         {:ok, label} <-
           Labels.update(label, Map.take(params, ~w(name color)), current_user(conn)) do
      json(conn, %{data: idea_label(label)})
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :manage),
         {:ok, label} <- Labels.fetch(board(conn), id),
         {:ok, :deleted} <- Labels.delete(label, current_user(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> IdeaBoardErrors.handle(conn)
  end
end
