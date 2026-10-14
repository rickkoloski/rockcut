defmodule RockcutApiWeb.TaskBoardController do
  @moduledoc """
  A department's task board (D38 §3.6; per department since D41): the board
  `GET`, task writes and the change log, under `/api/boards/:dept`. The
  `TaskBoard` plug puts the board's department in `conn.assigns.board`.
  Every action asks `Authz`: `:read` and `:write` on `{:tasks, dept}` for the
  department's members, `:history` for its managers. Owners pass `Authz`'s
  owner clause.

  D40: a department's shared tablet reads and writes its home board (not
  History, not another board). Each write from it needs a `staff_code` and is
  made as that person (`StaffCodeActing`), with the tablet in the change
  log; its responses carry `recorded_as` (the person's name), and a delete
  answers 200 with it instead of 204.

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
    only: [
      task_board: 1,
      all_task_boards: 1,
      task: 1,
      task_event: 1,
      task_series: 2,
      for_viewer: 2
    ]

  alias RockcutApi.{Authz, Tasks}
  alias RockcutApiWeb.{StaffCodeActing, TaskErrors}

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/boards/:dept/tasks?from=&to=: the board for that range."
  def index(conn, params) do
    with :ok <- allow(conn, :read),
         {:ok, from} <- date_param(params["from"]),
         {:ok, to} <- date_param(params["to"]),
         {:ok, board} <- Tasks.board(board(conn), from, to) do
      reply(conn, %{data: task_board(board)})
    end
    |> TaskErrors.handle(conn)
  end

  @doc """
  GET /api/boards/all/tasks?from=&to=: every board together (D41 §3.6),
  owners only, read-only. Not under the `TaskBoard` plug: there's no board.
  """
  def all(conn, params) do
    with :ok <- allow_all(conn),
         {:ok, from} <- date_param(params["from"]),
         {:ok, to} <- date_param(params["to"]),
         {:ok, boards} <- Tasks.all_boards(from, to) do
      json(conn, %{data: all_task_boards(boards)})
    end
    |> TaskErrors.handle(conn)
  end

  def create(conn, params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, task} <- Tasks.create(board(conn), Map.delete(params, "staff_code"), actor) do
      conn |> put_status(:created) |> render_task(task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <-
           Tasks.update(
             board(conn),
             task,
             Map.drop(params, ~w(id scope changed staff_code)),
             actor,
             series_opts(params)
           ) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/:dept/tasks/:id/move: `{ due_on, before_id? }`; `due_on: null` = Future."
  def move(conn, %{"id" => id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <-
           Tasks.move(board(conn), task, params["due_on"], params["before_id"], actor) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def move_overdue_to_today(conn, params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, count} <- Tasks.move_overdue_to_today(board(conn), actor) do
      reply(conn, %{moved: count}, actor)
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/:dept/tasks/:id/complete: `{ display? }` (required off its own day)."
  def complete(conn, %{"id" => id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.complete(board(conn), task, params["display"], actor) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def uncomplete(conn, %{"id" => id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.uncomplete(board(conn), task, actor) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def delete(conn, %{"id" => id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, task} <- fetch(conn, id),
         {:ok, :deleted} <- Tasks.delete(board(conn), task, actor, series_opts(params)) do
      if actor.on_device_id,
        do: reply(conn, %{}, actor),
        else: send_resp(conn, :no_content, "")
    end
    |> TaskErrors.handle(conn)
  end

  @doc """
  GET /api/boards/:dept/tasks/:id/series: the rule, `later_open` and
  `later_changed`. With the dialog's `repeat*` params (D42), also `change`:
  `{ kind: same | ends | rule, removes_open, removes_changed }`.
  """
  def series(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :read),
         {:ok, task} <- fetch(conn, id),
         {:ok, {series, preview}} <- Tasks.series_info(board(conn), task),
         {:ok, change} <- change_preview(conn, task, params) do
      data = task_series(series, preview)
      reply(conn, %{data: if(change, do: Map.put(data, :change, change), else: data)})
    end
    |> TaskErrors.handle(conn)
  end

  # D42 §2.6: given the dialog's repeat params, what saving them "following"
  # would do (an Ends-only change moves the end; a rule change splits).
  defp change_preview(conn, task, params) do
    repeat = Map.filter(params, fn {k, _} -> String.starts_with?(k, "repeat") end)
    if repeat == %{}, do: {:ok, nil}, else: Tasks.series_change_preview(board(conn), task, repeat)
  end

  @doc "POST /api/boards/:dept/tasks/:id/stop_repeating: `{ changed? }`. Ends the series on this one."
  def stop_repeating(conn, %{"id" => id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.stop_repeating(board(conn), task, actor, series_opts(params)) do
      render_task(conn, task, actor)
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
    if Authz.can?(current_user(conn), action, {:tasks, board(conn)}),
      do: :ok,
      else: {:error, :forbidden}
  end

  defp allow_all(conn) do
    if Authz.can?(current_user(conn), :read, {:tasks, :all}),
      do: :ok,
      else: {:error, :forbidden}
  end

  # Who a write is for (D40): the signed-in person, or on the board's shared
  # tablet the person whose staff code came with it, carrying the tablet for
  # the change log. Access to the board comes first, so a tablet on another
  # board is 403 before any code is checked.
  defp writer(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, person, device} <-
           StaffCodeActing.acting(conn, params, {:tasks, board(conn)}) do
      {:ok, %{person | on_device_id: device && device.id}}
    end
  end

  defp current_user(conn), do: conn.assigns.current_user
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

  defp render_task(conn, task, actor),
    do: reply(conn, %{data: task |> Tasks.with_names() |> task()}, actor)

  # A write's response from a shared tablet names the person it was recorded
  # as (D37's `recorded_as`), so the tablet can show "Acting as …".
  defp reply(conn, body, actor) do
    body = if actor.on_device_id, do: Map.put(body, :recorded_as, actor.name), else: body
    reply(conn, body)
  end

  defp reply(conn, body), do: json(conn, for_viewer(body, current_user(conn)))

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
