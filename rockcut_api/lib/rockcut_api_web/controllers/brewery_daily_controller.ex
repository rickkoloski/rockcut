defmodule RockcutApiWeb.BreweryDailyController do
  @moduledoc """
  The Brewery board's Daily card (D38 §3.6): ticking checks (`:write` on
  `:brewery_tasks`, any Brewery member) and the Daily items list (read by
  members; changed by Brewery managers, `:manage` on
  `:brewery_daily_items`). People only in D38.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [brewery_daily_item: 1]

  alias RockcutApi.{Authz, BreweryTasks}
  alias RockcutApiWeb.BreweryErrors

  action_fallback RockcutApiWeb.FallbackController

  @doc "PUT /api/brewery/daily_checks/:on_date/:daily_item_id: tick (today or earlier)."
  def tick(conn, %{"on_date" => on_date, "daily_item_id" => item_id}) do
    with :ok <- allow(conn, :write, :brewery_tasks),
         {:ok, item} <- fetch(item_id),
         {:ok, check} <- BreweryTasks.tick(on_date, item, actor(conn)) do
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
    |> BreweryErrors.handle(conn)
  end

  @doc "DELETE /api/brewery/daily_checks/:on_date/:daily_item_id: untick."
  def untick(conn, %{"on_date" => on_date, "daily_item_id" => item_id}) do
    with :ok <- allow(conn, :write, :brewery_tasks),
         {:ok, item} <- fetch(item_id),
         {:ok, :ok} <- BreweryTasks.untick(on_date, item, actor(conn)) do
      send_resp(conn, :no_content, "")
    end
    |> BreweryErrors.handle(conn)
  end

  @doc "GET /api/brewery/daily_items: the active items, in order."
  def items(conn, _params) do
    with :ok <- allow(conn, :read, :brewery_tasks) do
      render_items(conn, BreweryTasks.list_items())
    end
    |> BreweryErrors.handle(conn)
  end

  def create_item(conn, params) do
    with :ok <- allow(conn, :manage, :brewery_daily_items),
         {:ok, item} <- BreweryTasks.create_item(Map.take(params, ["name"]), actor(conn)) do
      conn |> put_status(:created) |> json(%{data: brewery_daily_item(item)})
    end
    |> BreweryErrors.handle(conn)
  end

  @doc "PATCH /api/brewery/daily_items/:id: `{ name? }` renames, `{ active: false }` retires."
  def update_item(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :manage, :brewery_daily_items),
         {:ok, item} <- fetch(id),
         {:ok, item} <- maybe_rename(item, params, actor(conn)),
         {:ok, item} <- maybe_retire(item, params, actor(conn)) do
      json(conn, %{data: brewery_daily_item(item)})
    end
    |> BreweryErrors.handle(conn)
  end

  @doc "PUT /api/brewery/daily_items/order: `{ ids: [...] }`, exactly the active items."
  def order_items(conn, params) do
    with :ok <- allow(conn, :manage, :brewery_daily_items),
         {:ok, items} <- BreweryTasks.order_items(params["ids"], actor(conn)) do
      render_items(conn, items)
    end
    |> BreweryErrors.handle(conn)
  end

  defp maybe_rename(item, %{"name" => name}, actor),
    do: BreweryTasks.rename_item(item, name, actor)

  defp maybe_rename(item, _params, _actor), do: {:ok, item}

  defp maybe_retire(item, %{"active" => active}, actor) when active in [false, "false"],
    do: BreweryTasks.retire_item(item, actor)

  defp maybe_retire(item, _params, _actor), do: {:ok, item}

  defp render_items(conn, items),
    do: json(conn, %{data: Enum.map(items, &brewery_daily_item/1)})

  defp allow(conn, action, area) do
    if Authz.can?(actor(conn), action, area), do: :ok, else: {:error, :forbidden}
  end

  defp actor(conn), do: conn.assigns.current_user

  # Active or retired: the context decides what a retired item allows.
  defp fetch(id) do
    case BreweryTasks.get_item(id) do
      nil -> {:error, :not_found}
      item -> {:ok, item}
    end
  end
end
