defmodule RockcutApiWeb.TaskBoardController do
  @moduledoc """
  A department's task board (D38 §3.6; per department since D41): the board
  `GET`, task writes and the change log, under `/api/boards/:dept`. The
  `TaskBoard` plug puts the board's department in `conn.assigns.board`.
  People only (D40 opens the writes to the brewhouse tablet). Every action
  asks `Authz`: `:read` and `:write` on `{:tasks, dept}` for the department's
  members, `:history` for its managers. Owners pass `Authz`'s owner clause.

  A route with a task id asks `Authz` first (someone outside the department
  gets 403 on every route, D38 S39), then finds the task **on this board**:
  another board's id is 404 (S115), and nothing changes.

  D39 recurring tasks: `POST` takes the flat `repeat*` params; `PATCH` and
  `DELETE` on an occurrence take `scope` (`this` | `following`) and
  `changed` (`keep`, the default, | `remove`), in the query or the body;
  `GET …/series` and `POST …/stop_repeating`.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers,
    only: [task_board: 1, task: 1, task_event: 1, task_series: 2]

  alias RockcutApi.{Authz, Tasks}
  alias RockcutApiWeb.TaskErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/boards/:dept/tasks?from=&to=: the board for that range."
  def index(conn, params) do
    with :ok <- allow(conn, :read),
         {:ok, from} <- date_param(params["from"]),
         {:ok, to} <- date_param(params["to"]),
         {:ok, board} <- Tasks.board(board(conn), from, to) do
      json(conn, %{data: task_board(board)})
    end
    |> TaskErrors.handle(conn)
  end

  def create(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- Tasks.create(board(conn), params, actor(conn)) do
      conn |> put_status(:created) |> render_task(task)
    end
    |> TaskErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <-
           Tasks.update(
             board(conn),
             task,
             Map.drop(params, ~w(id scope changed)),
             actor(conn),
             series_opts(params)
           ) do
      render_task(conn, task)
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/:dept/tasks/:id/move: `{ due_on, before_id? }`; `due_on: null` = Future."
  def move(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <-
           Tasks.move(board(conn), task, params["due_on"], params["before_id"], actor(conn)) do
      render_task(conn, task)
    end
    |> TaskErrors.handle(conn)
  end

  def move_overdue_to_today(conn, _params) do
    with :ok <- allow(conn, :write),
         {:ok, count} <- Tasks.move_overdue_to_today(board(conn), actor(conn)) do
      json(conn, %{moved: count})
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/:dept/tasks/:id/complete: `{ display? }` (required off its own day)."
  def complete(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.complete(board(conn), task, params["display"], actor(conn)) do
      render_task(conn, task)
    end
    |> TaskErrors.handle(conn)
  end

  def uncomplete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.uncomplete(board(conn), task, actor(conn)) do
      render_task(conn, task)
    end
    |> TaskErrors.handle(conn)
  end

  def delete(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(conn, id),
         {:ok, :deleted} <- Tasks.delete(board(conn), task, actor(conn), series_opts(params)) do
      send_resp(conn, :no_content, "")
    end
    |> TaskErrors.handle(conn)
  end

  @doc "GET /api/boards/:dept/tasks/:id/series: the rule, `later_open` and `later_changed`."
  def series(conn, %{"id" => id}) do
    with :ok <- allow(conn, :read),
         {:ok, task} <- fetch(conn, id),
         {:ok, {series, preview}} <- Tasks.series_info(board(conn), task) do
      json(conn, %{data: task_series(series, preview)})
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/:dept/tasks/:id/stop_repeating: `{ changed? }`. Ends the series on this one."
  def stop_repeating(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.stop_repeating(board(conn), task, actor(conn), series_opts(params)) do
      render_task(conn, task)
    end
    |> TaskErrors.handle(conn)
  end

  @doc "GET /api/boards/:dept/tasks/history?task_id=&page=: this board's, newest first, 50 a page."
  def history(conn, params) do
    with :ok <- allow(conn, :history) do
      task_id = int_param(params["task_id"], nil)
      page = max(int_param(params["page"], 1), 1)

      %{events: events, page: page, total: total, names: names} =
        Tasks.list_events(board(conn), task_id, page)

      json(conn, %{
        data: Enum.map(events, &task_event/1),
        names: names,
        page: page,
        total: total,
        per_page: Tasks.history_page_size()
      })
    end
    |> TaskErrors.handle(conn)
  end

  defp allow(conn, action) do
    if Authz.can?(actor(conn), action, {:tasks, board(conn)}),
      do: :ok,
      else: {:error, :forbidden}
  end

  defp actor(conn), do: conn.assigns.current_user
  defp board(conn), do: conn.assigns.board

  defp series_opts(params) do
    [
      scope: params["scope"],
      changed: if(params["changed"] == "remove", do: :remove, else: :keep)
    ]
  end

  # The task on this board. One someone deleted here is 410 `deleted` (a stale
  # dialog or menu, D39 O-1); an id that never existed, or another board's,
  # is 404.
  defp fetch(conn, id) do
    case Tasks.get_task(board(conn), id) do
      nil ->
        if Tasks.deleted_task?(board(conn), id),
          do: {:error, :deleted},
          else: {:error, :not_found}

      task ->
        {:ok, task}
    end
  end

  defp render_task(conn, task),
    do: json(conn, %{data: task |> Tasks.with_names() |> task()})

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
