defmodule RockcutApiWeb.BreweryTaskController do
  @moduledoc """
  The Brewery task board (D38 §3.6): the board `GET`, task writes and the
  change log. People only in D38 (the router's `:brewery` scope; D40 opens the
  writes to the brewhouse tablet). Every action asks `Authz` first: `:read`
  and `:write` on `:brewery_tasks` for Brewery members, `:history` for Brewery
  managers. Owners pass `Authz`'s owner clause.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers,
    only: [brewery_board: 1, brewery_task: 1, brewery_task_event: 1]

  alias RockcutApi.{Authz, BreweryTasks}
  alias RockcutApiWeb.BreweryErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/brewery/tasks?from=&to=: the board for that range."
  def index(conn, params) do
    with :ok <- allow(conn, :read),
         {:ok, from} <- date_param(params["from"]),
         {:ok, to} <- date_param(params["to"]),
         {:ok, board} <- BreweryTasks.board(from, to) do
      json(conn, %{data: brewery_board(board)})
    end
    |> BreweryErrors.handle(conn)
  end

  def create(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- BreweryTasks.create(params, actor(conn)) do
      conn |> put_status(:created) |> render_task(task)
    end
    |> BreweryErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(id),
         {:ok, task} <- BreweryTasks.update(task, Map.drop(params, ["id"]), actor(conn)) do
      render_task(conn, task)
    end
    |> BreweryErrors.handle(conn)
  end

  @doc "POST /api/brewery/tasks/:id/move: `{ due_on, before_id? }`; `due_on: null` = Future."
  def move(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(id),
         {:ok, task} <-
           BreweryTasks.move(task, params["due_on"], params["before_id"], actor(conn)) do
      render_task(conn, task)
    end
    |> BreweryErrors.handle(conn)
  end

  def move_overdue_to_today(conn, _params) do
    with :ok <- allow(conn, :write),
         {:ok, count} <- BreweryTasks.move_overdue_to_today(actor(conn)) do
      json(conn, %{moved: count})
    end
    |> BreweryErrors.handle(conn)
  end

  @doc "POST /api/brewery/tasks/:id/complete: `{ display? }` (required off its own day)."
  def complete(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(id),
         {:ok, task} <- BreweryTasks.complete(task, params["display"], actor(conn)) do
      render_task(conn, task)
    end
    |> BreweryErrors.handle(conn)
  end

  def uncomplete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(id),
         {:ok, task} <- BreweryTasks.uncomplete(task, actor(conn)) do
      render_task(conn, task)
    end
    |> BreweryErrors.handle(conn)
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(id),
         {:ok, :deleted} <- BreweryTasks.delete(task, actor(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> BreweryErrors.handle(conn)
  end

  @doc "GET /api/brewery/tasks/history?task_id=&page=: newest first, 50 a page."
  def history(conn, params) do
    with :ok <- allow(conn, :history) do
      task_id = int_param(params["task_id"], nil)
      page = max(int_param(params["page"], 1), 1)

      %{events: events, page: page, total: total, names: names} =
        BreweryTasks.list_events(task_id, page)

      json(conn, %{
        data: Enum.map(events, &brewery_task_event/1),
        names: names,
        page: page,
        total: total,
        per_page: BreweryTasks.history_page_size()
      })
    end
    |> BreweryErrors.handle(conn)
  end

  defp allow(conn, action) do
    if Authz.can?(actor(conn), action, :brewery_tasks), do: :ok, else: {:error, :forbidden}
  end

  defp actor(conn), do: conn.assigns.current_user

  defp fetch(id) do
    case BreweryTasks.get_task(id) do
      nil -> {:error, :not_found}
      task -> {:ok, task}
    end
  end

  defp render_task(conn, task),
    do: json(conn, %{data: task |> BreweryTasks.with_names() |> brewery_task()})

  defp date_param(value) when is_binary(value) do
    case Date.from_iso8601(value) do
      {:ok, date} -> {:ok, date}
      _ -> {:error, :invalid_date}
    end
  end

  defp date_param(_), do: {:error, :invalid_date}

  defp int_param(nil, default), do: default
  defp int_param("", default), do: default

  defp int_param(value, default) do
    case Integer.parse(to_string(value)) do
      {n, ""} -> n
      _ -> default
    end
  end
end
