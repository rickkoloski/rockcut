defmodule RockcutApiWeb.IdeaListController do
  @moduledoc """
  D53 Part 2: an Idea Board's lists (§4.3–§4.5), under
  `/api/idea_boards/:board/lists`. People only (the routes are behind
  `DeviceGate`). Checks as `IdeaBoardAccess`: the board (403), the id
  (404), the lock (423). Adding a list is `:write`; renaming, moving,
  archiving and restoring one are `:change` on it (both also refuse a
  non-manager when the list holds a locked card); locking, unlocking and
  deleting for good are `:manage`. An archived list can't be renamed.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [idea_list: 1]
  import RockcutApiWeb.IdeaBoardAccess

  alias RockcutApi.Repo
  alias RockcutApi.IdeaBoards.Lists
  alias RockcutApiWeb.IdeaBoardErrors

  action_fallback RockcutApiWeb.FallbackController

  def create(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.create(board(conn), Map.take(params, ["name"]), current_user(conn)) do
      conn |> put_status(:created) |> render_list(list)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.fetch(board(conn), id),
         :ok <- change(conn, list),
         {:ok, list} <- Lists.rename(list, Map.take(params, ["name"]), current_user(conn)) do
      render_list(conn, list)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "POST …/lists/:id/move `{before_id}`: ahead of that list, or last."
  def move(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.fetch(board(conn), id),
         :ok <- change(conn, list),
         {:ok, list} <- Lists.move(list, params["before_id"], current_user(conn)) do
      render_list(conn, list)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def lock(conn, %{"id" => id}), do: set_locked(conn, id, true)
  def unlock(conn, %{"id" => id}), do: set_locked(conn, id, false)

  defp set_locked(conn, id, locked?) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.fetch(board(conn), id),
         :ok <- allow(conn, :manage),
         {:ok, list} <- Lists.set_locked(list, locked?, current_user(conn)) do
      render_list(conn, list)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def archive(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.fetch(board(conn), id),
         :ok <- archive_list(conn, list),
         {:ok, list} <- Lists.archive(list, current_user(conn)) do
      render_list(conn, list)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  def restore(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.fetch(board(conn), id),
         :ok <- archive_list(conn, list, :restore),
         {:ok, list} <- Lists.restore(list, current_user(conn)) do
      render_list(conn, list)
    end
    |> IdeaBoardErrors.handle(conn)
  end

  @doc "DELETE …/lists/:id: an archived list, for good (managers)."
  def delete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- Lists.fetch(board(conn), id),
         :ok <- allow(conn, :manage),
         {:ok, :deleted} <- Lists.delete(list, current_user(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> IdeaBoardErrors.handle(conn)
  end

  defp render_list(conn, list),
    do: json(conn, %{data: list |> Repo.preload(:locked_by, force: true) |> idea_list()})
end
