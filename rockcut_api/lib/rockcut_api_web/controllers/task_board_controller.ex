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

  D49 §3.12 (plan decision 7): a **linked task** (made from a production
  step, `Production.TaskLink`) is the step's, so its writes go to
  Production, each also needing `:write` on `:production`: move / Change
  day → `Steps.move/3` (no `answer` with steps following → 422
  `answer_required` with the prompt's preview, as `POST
  /api/production/steps/move`; same day → the board's reorder), complete →
  `Steps.complete/4` (the batch-number and off-plan prompts; never
  "where should it show"), uncomplete → `Steps.uncomplete/1`, notes and
  assignee → `Steps.update/2`, delete → the step's `on_task_list` off. A
  title or repeat change, Future, `stop_repeating` and the series read are
  422 `linked_task`. Move and complete take `preview: true`. Responses
  carry the production `undo_token` (`POST /api/production/undo/:token`)
  and the write's `result` (`renumbered`, `out_of_order`, `message`). A
  shared tablet gets 403 `linked_task_device` on every one (decision 8,
  until D50), with a staff code or without; "Sign in as me" is a person.

  `GET …/tasks?linked=true`: only the linked tasks (the Gantt's Task list).
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

  alias RockcutApi.{Authz, Repo, Tasks}
  alias RockcutApi.Production.{Step, Steps, Undo}
  alias RockcutApi.Tasks.{Series, Task}
  alias RockcutApiWeb.{ProductionErrors, StaffCodeActing, TaskErrors}

  action_fallback RockcutApiWeb.FallbackController

  @doc "GET /api/boards/:dept/tasks?from=&to=: the board for that range."
  def index(conn, params) do
    with :ok <- allow(conn, :read),
         {:ok, from} <- date_param(params["from"]),
         {:ok, to} <- date_param(params["to"]),
         {:ok, board} <-
           Tasks.board(board(conn), from, to, Tasks.today(), linked: params["linked"] == "true") do
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
    with {:ok, actor} <- writer(conn),
         {:ok, task} <- Tasks.create(board(conn), Map.delete(params, "staff_code"), actor) do
      conn |> put_status(:created) |> render_task(task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def update(conn, %{"id" => id} = params) do
    case linked(conn, id) do
      {:linked, task} -> linked_write(conn, task, &linked_update(&1, &2, &3, params))
      :board -> board_update(conn, id, params)
    end
  end

  defp board_update(conn, id, params) do
    with {:ok, actor} <- writer(conn),
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
    case linked(conn, id) do
      {:linked, task} -> linked_write(conn, task, &linked_move(&1, &2, &3, params))
      :board -> board_move(conn, id, params)
    end
  end

  defp board_move(conn, id, params) do
    with {:ok, actor} <- writer(conn),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <-
           Tasks.move(board(conn), task, params["due_on"], params["before_id"], actor) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def move_overdue_to_today(conn, _params) do
    with {:ok, actor} <- writer(conn),
         {:ok, count} <- Tasks.move_overdue_to_today(board(conn), actor) do
      reply(conn, %{moved: count}, actor)
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/:dept/tasks/:id/complete: `{ display? }` (required off its own day)."
  def complete(conn, %{"id" => id} = params) do
    case linked(conn, id) do
      {:linked, task} -> linked_write(conn, task, &linked_complete(&1, &2, &3, params))
      :board -> board_complete(conn, id, params)
    end
  end

  defp board_complete(conn, id, params) do
    with {:ok, actor} <- writer(conn),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.complete(board(conn), task, params["display"], actor) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def uncomplete(conn, %{"id" => id}) do
    case linked(conn, id) do
      {:linked, task} -> linked_write(conn, task, &linked_uncomplete/3)
      :board -> board_uncomplete(conn, id)
    end
  end

  defp board_uncomplete(conn, id) do
    with {:ok, actor} <- writer(conn),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.uncomplete(board(conn), task, actor) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  def delete(conn, %{"id" => id} = params) do
    case linked(conn, id) do
      {:linked, task} -> linked_write(conn, task, &linked_delete/3)
      :board -> board_delete(conn, id, params)
    end
  end

  defp board_delete(conn, id, params) do
    with {:ok, actor} <- writer(conn),
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
         :ok <- not_linked(task),
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
    case linked(conn, id) do
      {:linked, task} -> linked_write(conn, task, fn _, _, _ -> {:error, :linked_task} end)
      :board -> board_stop_repeating(conn, id, params)
    end
  end

  defp board_stop_repeating(conn, id, params) do
    with {:ok, actor} <- writer(conn),
         {:ok, task} <- fetch(conn, id),
         {:ok, task} <- Tasks.stop_repeating(board(conn), task, actor, series_opts(params)) do
      render_task(conn, task, actor)
    end
    |> TaskErrors.handle(conn)
  end

  ## Linked tasks (D49 §3.12)

  # A task on this board made from a production step, or `:board` (anything
  # else, a missing id included: the board's own path answers it).
  defp linked(conn, id) do
    case Tasks.get_task(board(conn), id) do
      %Task{production_step_id: step_id} = task when not is_nil(step_id) -> {:linked, task}
      _ -> :board
    end
  end

  defp not_linked(%Task{} = task),
    do: if(Task.linked?(task), do: {:error, :linked_task}, else: :ok)

  # The board's write access first (another board's tablet: 403), then a
  # shared tablet is refused whatever it sends (decision 8), then
  # Production's. `fun.(person, task, step)` returns `{:ok, {result, token}}`,
  # `{:preview, preview}`, `{:board, conn}` or an error.
  defp linked_write(conn, %Task{} = task, fun) do
    person = current_user(conn)

    with :ok <- allow(conn, :write),
         :ok <- if(Authz.device?(person), do: {:error, :linked_task_device}, else: :ok),
         :ok <- if(Authz.can?(person, :write, :production), do: :ok, else: {:error, :forbidden}),
         %Step{} = step <- Repo.get(Step, task.production_step_id) || {:error, :not_found} do
      case fun.(person, task, step) do
        {:ok, {result, token}} -> render_linked(conn, task, result, token)
        {:preview, preview} -> json(conn, %{data: %{preview: preview}})
        {:board, %Plug.Conn{} = conn} -> conn
        other -> other
      end
    end
    |> linked_errors(conn)
  end

  # The board's own refusals (a reorder's, `linked_task`) as the board
  # answers them; the schedule's as the schedule does.
  defp linked_errors({:error, code} = error, conn) when is_atom(code) do
    if TaskErrors.known?(code),
      do: TaskErrors.handle(error, conn),
      else: ProductionErrors.handle(error, conn)
  end

  defp linked_errors(other, conn), do: ProductionErrors.handle(other, conn)

  # Notes and assignee go to the step; a new day is a move; a title or a
  # repeat is refused.
  defp linked_update(person, task, step, params) do
    cond do
      Series.repeat?(params) ->
        {:error, :linked_task}

      Map.has_key?(params, "title") and String.trim(to_string(params["title"])) != task.title ->
        {:error, :linked_task}

      Map.has_key?(params, "due_on") and params["due_on"] != Date.to_iso8601(task.due_on) ->
        with {:ok, days} <- linked_days(task, params["due_on"]) do
          tracked(person, step, fn ->
            Repo.transaction(fn ->
              edit_step!(step, params)
              ok!(Steps.move([step.id], days, answer: params["answer"]))
            end)
          end)
        end

      true ->
        tracked(person, step, fn ->
          with {:ok, _} <- Steps.update(step, Map.take(params, ~w(notes assignee_id))),
               do: {:ok, %{}}
        end)
    end
  end

  defp edit_step!(step, params) do
    case Map.take(params, ~w(notes assignee_id)) do
      edits when edits == %{} -> :ok
      edits -> ok!(Steps.update(step, edits))
    end
  end

  # Another day moves the step (the move prompt); the same day is the
  # board's reorder.
  defp linked_move(person, task, step, params) do
    case linked_days(task, params["due_on"]) do
      {:ok, 0} ->
        with {:ok, task} <-
               Tasks.move(board_of(task), task, params["due_on"], params["before_id"], person),
             do: {:ok, {%{task: task}, nil}}

      {:ok, days} ->
        if truthy?(params["preview"]) do
          with {:ok, {:preview, preview}} <- Steps.move([step.id], days, preview: true),
               do: {:preview, preview}
        else
          tracked(person, step, fn -> Steps.move([step.id], days, answer: params["answer"]) end)
        end

      error ->
        error
    end
  end

  defp linked_days(%Task{due_on: due_on}, value) do
    case value && Date.from_iso8601(to_string(value)) do
      {:ok, day} -> {:ok, Date.diff(day, due_on)}
      # A linked task is always on a day: no Future.
      v when v in [nil, ""] -> {:error, :linked_task}
      _ -> {:error, :invalid_date}
    end
  end

  # Today unless `done_on` says otherwise; the batch number and the
  # off-plan answer as on the schedule. Already done: a no-op, as on the board.
  defp linked_complete(person, task, step, params) do
    attrs = Map.take(params, ~w(done_on batch_number answer))

    cond do
      step.done_on != nil ->
        {:ok, {%{task: task}, nil}}

      truthy?(params["preview"]) ->
        with {:ok, {:preview, preview}} <-
               Steps.complete(step.id, attrs, person, preview: true),
             do: {:preview, preview}

      true ->
        tracked(person, step, fn -> Steps.complete(step.id, attrs, person) end)
    end
  end

  defp linked_uncomplete(person, task, step) do
    if step.done_on == nil,
      do: {:ok, {%{task: task}, nil}},
      else: tracked(person, step, fn -> Steps.uncomplete(step.id) end)
  end

  # Off the task list; the step stays on the schedule.
  defp linked_delete(person, _task, step) do
    tracked(person, step, fn ->
      with {:ok, _} <- Steps.update(step, %{"on_task_list" => false}), do: {:ok, %{}}
    end)
  end

  defp tracked(person, %Step{id: id}, fun), do: Undo.track(person, Undo.step_scope([id]), fun)

  # The task as the write left it (`data`: nil once it's gone), the write's
  # `result` and its Undo token.
  defp render_linked(conn, %Task{id: id}, result, token) do
    task =
      case result do
        %{task: %Task{} = t} -> t
        _ -> Repo.get(Task, id)
      end

    json(
      conn,
      for_viewer(
        %{
          data: task && task |> Tasks.with_names() |> task(),
          result: Map.take(result, [:renumbered, :out_of_order, :message]),
          undo_token: token
        },
        current_user(conn)
      )
    )
  end

  defp board_of(%Task{department_id: id}), do: RockcutApi.Accounts.get_department!(id)

  defp ok!({:ok, result}), do: result
  defp ok!({:error, reason}), do: Repo.rollback(reason)

  defp truthy?(v), do: v in [true, "true", 1, "1"]

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
  defp writer(conn) do
    with :ok <- allow(conn, :write),
         {:ok, person, device} <-
           StaffCodeActing.acting(conn, {:tasks, board(conn)}) do
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
