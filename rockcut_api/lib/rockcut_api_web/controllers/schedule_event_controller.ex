defmodule RockcutApiWeb.ScheduleEventController do
  @moduledoc """
  Schedule events (D32). An event the actor can't read answers 404, so a hidden
  draft doesn't reveal that it exists; one they can read but can't change
  answers 403.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [schedule_event: 1]
  alias RockcutApi.{Scheduling, Authz}
  alias RockcutApi.Scheduling.ScheduleEvent

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    events = Scheduling.list_events(conn.assigns.current_user, params)
    json(conn, %{data: Enum.map(events, &schedule_event/1)})
  end

  def show(conn, %{"id" => id}) do
    with_event(conn, id, :read, fn e -> json(conn, %{data: schedule_event(e)}) end)
  end

  def create(conn, params) do
    actor = conn.assigns.current_user
    dept_id = to_int(params["department_id"])

    if dept_id &&
         Authz.can?(actor, :create, %ScheduleEvent{department_id: dept_id, status: "draft"}) do
      with {:ok, e} <- Scheduling.create_event(params, actor) do
        conn |> put_status(:created) |> json(%{data: schedule_event(e)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    actor = conn.assigns.current_user

    with_event(conn, id, :update, fn e ->
      # Moving an event to another department needs the right to manage that one too.
      new_dept = to_int(params["department_id"]) || e.department_id

      if Authz.can?(actor, :update, %ScheduleEvent{department_id: new_dept, status: e.status}) do
        with {:ok, updated} <- Scheduling.update_event(e, Map.drop(params, ["id"])) do
          json(conn, %{data: schedule_event(updated)})
        end
      else
        forbidden(conn)
      end
    end)
  end

  def delete(conn, %{"id" => id}) do
    with_event(conn, id, :delete, fn e ->
      with {:ok, _} <- Scheduling.delete_event(e), do: json(conn, %{ok: true})
    end)
  end

  def publish(conn, %{"id" => id}) do
    with_event(conn, id, :publish, fn e ->
      with {:ok, updated} <- Scheduling.publish_event(e) do
        json(conn, %{data: schedule_event(updated)})
      end
    end)
  end

  def unpublish(conn, %{"id" => id}) do
    with_event(conn, id, :unpublish, fn e ->
      with {:ok, updated} <- Scheduling.unpublish_event(e) do
        json(conn, %{data: schedule_event(updated)})
      end
    end)
  end

  # Publish week: publishes every listed event the actor may publish.
  def publish_batch(conn, %{"ids" => ids}) when is_list(ids) do
    actor = conn.assigns.current_user

    events =
      ids
      |> Enum.map(&Scheduling.get_event/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.filter(&Authz.can?(actor, :publish, &1))

    {:ok, published} = Scheduling.publish_events(events)
    json(conn, %{data: Enum.map(published, &schedule_event/1), count: length(published)})
  end

  def publish_batch(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "ids (list) required"})
  end

  ## Helpers

  defp with_event(conn, id, action, fun) do
    actor = conn.assigns.current_user

    with %ScheduleEvent{} = e <- Scheduling.get_event(id),
         true <- Authz.can?(actor, :read, e) do
      if Authz.can?(actor, action, e), do: fun.(e), else: forbidden(conn)
    else
      _ -> {:error, :not_found}
    end
  end

  defp to_int(nil), do: nil
  defp to_int(v) when is_integer(v), do: v

  defp to_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, ""} -> n
      _ -> nil
    end
  end

  defp to_int(_), do: nil

  defp forbidden(conn) do
    conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
  end
end
