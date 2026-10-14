defmodule RockcutApiWeb.DailyController do
  @moduledoc """
  A board's Daily card (D38 §3.6; per department since D41): ticking checks
  (`:write` on `{:tasks, dept}`, any member of the department) and the Daily
  items list (read by its members; changed by its managers, `:manage` on
  `{:daily_items, dept}`). A route with an item id asks `Authz` first, then
  finds the item on this board: another board's is 404.

  D40: a department's shared tablet ticks and unticks its home board's checks
  with a `staff_code`, as the person it belongs to (`StaffCodeActing`); the
  responses carry `recorded_as`, and an untick answers 200 with it instead of
  204. It reads the items list (the board needs it) but never changes it.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [daily_item: 1, for_viewer: 2]

  alias RockcutApi.{Authz, Tasks}
  alias RockcutApiWeb.{StaffCodeActing, TaskErrors}

  action_fallback RockcutApiWeb.FallbackController

  @doc "PUT /api/boards/:dept/daily_checks/:on_date/:daily_item_id: tick (today or earlier)."
  def tick(conn, %{"on_date" => on_date, "daily_item_id" => item_id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, item} <- fetch(conn, item_id),
         {:ok, check} <- Tasks.tick(board(conn), on_date, item, actor) do
      reply(
        conn,
        %{
          data: %{
            on_date: check.on_date,
            daily_item_id: check.daily_item_id,
            checked: true,
            completed_by_id: check.completed_by_id,
            completed_at: check.completed_at
          }
        },
        actor
      )
    end
    |> TaskErrors.handle(conn)
  end

  @doc "DELETE /api/boards/:dept/daily_checks/:on_date/:daily_item_id: untick."
  def untick(conn, %{"on_date" => on_date, "daily_item_id" => item_id} = params) do
    with {:ok, actor} <- writer(conn, params),
         {:ok, item} <- fetch(conn, item_id),
         {:ok, :ok} <- Tasks.untick(board(conn), on_date, item, actor) do
      if actor.on_device_id,
        do: reply(conn, %{}, actor),
        else: send_resp(conn, :no_content, "")
    end
    |> TaskErrors.handle(conn)
  end

  @doc """
  GET /api/boards/:dept/daily_items: the active items, in order. With
  `include_retired=true` (D39), the retired ones follow, by name.
  """
  def items(conn, params) do
    with :ok <- allow(conn, :read, :tasks) do
      retired =
        if params["include_retired"] in ["true", true],
          do: Tasks.list_retired_items(board(conn)),
          else: []

      render_items(conn, Tasks.list_items(board(conn)) ++ retired)
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/:dept/daily_items/:id/restore: a retired item back at the bottom (D39, S75)."
  def restore_item(conn, %{"id" => id}) do
    with :ok <- allow(conn, :manage, :daily_items),
         {:ok, item} <- fetch(conn, id),
         {:ok, item} <- Tasks.restore_item(board(conn), item, actor(conn)) do
      json(conn, %{data: daily_item(item)})
    end
    |> TaskErrors.handle(conn)
  end

  @doc """
  DELETE /api/boards/:dept/daily_items/:id: a retired item never ticked (D42
  §2.4); otherwise 422 `not_retired` or `has_ticks`.
  """
  def delete_item(conn, %{"id" => id}) do
    with :ok <- allow(conn, :manage, :daily_items),
         {:ok, item} <- fetch(conn, id),
         {:ok, :ok} <- Tasks.delete_item(board(conn), item, actor(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> TaskErrors.handle(conn)
  end

  def create_item(conn, params) do
    with :ok <- allow(conn, :manage, :daily_items),
         {:ok, item} <- Tasks.create_item(board(conn), Map.take(params, ["name"]), actor(conn)) do
      conn |> put_status(:created) |> json(%{data: daily_item(item)})
    end
    |> TaskErrors.handle(conn)
  end

  @doc """
  PATCH /api/boards/:dept/daily_items/:id: `{ name? }` renames, `{ active: false }`
  retires. Any `PATCH` on a retired item (a rename, `active`, `position`) is a
  422 `retired` and changes nothing (G3, D39 GAP-1/GAP-2); restore brings one
  back.
  """
  def update_item(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :manage, :daily_items),
         {:ok, item} <- fetch(conn, id),
         :ok <- refuse_retired(item),
         {:ok, item} <- maybe_rename(board(conn), item, params, actor(conn)),
         {:ok, item} <- maybe_retire(board(conn), item, params, actor(conn)) do
      json(conn, %{data: daily_item(item)})
    end
    |> TaskErrors.handle(conn)
  end

  @doc "PUT /api/boards/:dept/daily_items/order: `{ ids: [...] }`, exactly the active items."
  def order_items(conn, params) do
    with :ok <- allow(conn, :manage, :daily_items),
         {:ok, items} <- Tasks.order_items(board(conn), params["ids"], actor(conn)) do
      render_items(conn, items)
    end
    |> TaskErrors.handle(conn)
  end

  defp refuse_retired(%{active: false}), do: {:error, :retired}
  defp refuse_retired(_item), do: :ok

  defp maybe_rename(dept, item, %{"name" => name}, actor),
    do: Tasks.rename_item(dept, item, name, actor)

  defp maybe_rename(_dept, item, _params, _actor), do: {:ok, item}

  defp maybe_retire(dept, item, %{"active" => active}, actor) when active in [false, "false"],
    do: Tasks.retire_item(dept, item, actor)

  defp maybe_retire(_dept, item, _params, _actor), do: {:ok, item}

  defp render_items(conn, items),
    do: json(conn, for_viewer(%{data: Enum.map(items, &daily_item/1)}, actor(conn)))

  defp allow(conn, action, area) do
    if Authz.can?(actor(conn), action, {area, board(conn)}),
      do: :ok,
      else: {:error, :forbidden}
  end

  # Who a tick is for (D40): the signed-in person, or on the board's shared
  # tablet the person whose staff code came with it (`TaskBoardController`
  # does the same for tasks).
  defp writer(conn, params) do
    with :ok <- allow(conn, :write, :tasks),
         {:ok, person, device} <-
           StaffCodeActing.acting(conn, params, {:tasks, board(conn)}) do
      {:ok, %{person | on_device_id: device && device.id}}
    end
  end

  defp reply(conn, body, actor) do
    body = if actor.on_device_id, do: Map.put(body, :recorded_as, actor.name), else: body
    json(conn, for_viewer(body, actor(conn)))
  end

  defp actor(conn), do: conn.assigns.current_user
  defp board(conn), do: conn.assigns.board

  # The item on this board, active or retired: the context decides what a
  # retired item allows.
  defp fetch(conn, id) do
    case Tasks.get_item(board(conn), id) do
      nil -> {:error, :not_found}
      item -> {:ok, item}
    end
  end
end
