defmodule RockcutApiWeb.DailyController do
  @moduledoc """
  The Brewery board's Daily card (D38 §3.6): ticking checks (`:write` on
  `:brewery_tasks`, any Brewery member) and the Daily items list (read by
  members; changed by Brewery managers, `:manage` on
  `:brewery_daily_items`). People only in D38.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [daily_item: 1]

  alias RockcutApi.{Authz, Tasks}
  alias RockcutApiWeb.TaskErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "PUT /api/boards/brewery/daily_checks/:on_date/:daily_item_id: tick (today or earlier)."
  def tick(conn, %{"on_date" => on_date, "daily_item_id" => item_id}) do
    with :ok <- allow(conn, :write, :brewery_tasks),
         {:ok, item} <- fetch(item_id),
         {:ok, check} <- Tasks.tick(on_date, item, actor(conn)) do
      json(conn, %{
        data: %{
          on_date: check.on_date,
          daily_item_id: check.daily_item_id,
          checked: true,
          completed_by_id: check.completed_by_id,
          completed_at: check.completed_at
        }
      })
    end
    |> TaskErrors.handle(conn)
  end

  @doc "DELETE /api/boards/brewery/daily_checks/:on_date/:daily_item_id: untick."
  def untick(conn, %{"on_date" => on_date, "daily_item_id" => item_id}) do
    with :ok <- allow(conn, :write, :brewery_tasks),
         {:ok, item} <- fetch(item_id),
         {:ok, :ok} <- Tasks.untick(on_date, item, actor(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> TaskErrors.handle(conn)
  end

  @doc """
  GET /api/boards/brewery/daily_items: the active items, in order. With
  `include_retired=true` (D39), the retired ones follow, by name.
  """
  def items(conn, params) do
    with :ok <- allow(conn, :read, :brewery_tasks) do
      retired =
        if params["include_retired"] in ["true", true],
          do: Tasks.list_retired_items(),
          else: []

      render_items(conn, Tasks.list_items() ++ retired)
    end
    |> TaskErrors.handle(conn)
  end

  @doc "POST /api/boards/brewery/daily_items/:id/restore: a retired item back at the bottom (D39, S75)."
  def restore_item(conn, %{"id" => id}) do
    with :ok <- allow(conn, :manage, :brewery_daily_items),
         {:ok, item} <- fetch(id),
         {:ok, item} <- Tasks.restore_item(item, actor(conn)) do
      json(conn, %{data: daily_item(item)})
    end
    |> TaskErrors.handle(conn)
  end

  def create_item(conn, params) do
    with :ok <- allow(conn, :manage, :brewery_daily_items),
         {:ok, item} <- Tasks.create_item(Map.take(params, ["name"]), actor(conn)) do
      conn |> put_status(:created) |> json(%{data: daily_item(item)})
    end
    |> TaskErrors.handle(conn)
  end

  @doc """
  PATCH /api/boards/brewery/daily_items/:id: `{ name? }` renames, `{ active: false }`
  retires. Any `PATCH` on a retired item (a rename, `active`, `position`) is a
  422 `retired` and changes nothing (G3, D39 GAP-1/GAP-2); restore brings one
  back.
  """
  def update_item(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :manage, :brewery_daily_items),
         {:ok, item} <- fetch(id),
         :ok <- refuse_retired(item),
         {:ok, item} <- maybe_rename(item, params, actor(conn)),
         {:ok, item} <- maybe_retire(item, params, actor(conn)) do
      json(conn, %{data: daily_item(item)})
    end
    |> TaskErrors.handle(conn)
  end

  @doc "PUT /api/boards/brewery/daily_items/order: `{ ids: [...] }`, exactly the active items."
  def order_items(conn, params) do
    with :ok <- allow(conn, :manage, :brewery_daily_items),
         {:ok, items} <- Tasks.order_items(params["ids"], actor(conn)) do
      render_items(conn, items)
    end
    |> TaskErrors.handle(conn)
  end

  defp refuse_retired(%{active: false}), do: {:error, :retired}
  defp refuse_retired(_item), do: :ok

  defp maybe_rename(item, %{"name" => name}, actor),
    do: Tasks.rename_item(item, name, actor)

  defp maybe_rename(item, _params, _actor), do: {:ok, item}

  defp maybe_retire(item, %{"active" => active}, actor) when active in [false, "false"],
    do: Tasks.retire_item(item, actor)

  defp maybe_retire(item, _params, _actor), do: {:ok, item}

  defp render_items(conn, items),
    do: json(conn, %{data: Enum.map(items, &daily_item/1)})

  defp allow(conn, action, area) do
    if Authz.can?(actor(conn), action, area), do: :ok, else: {:error, :forbidden}
  end

  defp actor(conn), do: conn.assigns.current_user

  # Active or retired: the context decides what a retired item allows.
  defp fetch(id) do
    case Tasks.get_item(id) do
      nil -> {:error, :not_found}
      item -> {:ok, item}
    end
  end
end
