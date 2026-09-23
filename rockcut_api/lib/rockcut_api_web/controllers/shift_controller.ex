defmodule RockcutApiWeb.ShiftController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [shift: 1]
  alias RockcutApi.{Scheduling, Authz}
  alias RockcutApi.Scheduling.Shift

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    shifts = Scheduling.list_shifts(conn.assigns.current_user, params)
    json(conn, %{data: Enum.map(shifts, &shift/1)})
  end

  def show(conn, %{"id" => id}) do
    actor = conn.assigns.current_user

    case Scheduling.get_shift(id) do
      nil ->
        {:error, :not_found}

      %Shift{} = s ->
        if Authz.can?(actor, :read, s), do: json(conn, %{data: shift(s)}), else: forbidden(conn)
    end
  end

  def create(conn, params) do
    actor = conn.assigns.current_user
    # A shift's department follows its position; authorize against that department.
    dept_id = Scheduling.department_for_position(params["position_id"])

    if dept_id && Authz.can?(actor, :create, %Shift{department_id: dept_id, status: "draft"}) do
      with {:ok, s} <- Scheduling.create_shift(params, actor) do
        conn |> put_status(:created) |> json(%{data: shift(s)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    actor = conn.assigns.current_user

    case Scheduling.get_shift(id) do
      nil ->
        {:error, :not_found}

      %Shift{} = s ->
        # Managing the shift's current department, and (if the position changes
        # departments) the destination department too.
        new_dept = Scheduling.department_for_position(params["position_id"]) || s.department_id

        if Authz.can?(actor, :update, s) and
             Authz.can?(actor, :update, %Shift{department_id: new_dept, status: s.status}) do
          with {:ok, updated} <- Scheduling.update_shift(s, Map.drop(params, ["id"])) do
            json(conn, %{data: shift(updated)})
          end
        else
          forbidden(conn)
        end
    end
  end

  def delete(conn, %{"id" => id}) do
    with_shift(conn, id, :delete, fn s ->
      with {:ok, _} <- Scheduling.delete_shift(s) do
        json(conn, %{ok: true})
      end
    end)
  end

  def publish(conn, %{"id" => id}) do
    with_shift(conn, id, :publish, fn s ->
      with {:ok, updated} <- Scheduling.publish_shift(s) do
        json(conn, %{data: shift(updated)})
      end
    end)
  end

  # Bulk publish (Publish week / Publish for employee): publishes every shift the
  # actor may publish, then sends one coalesced notification per recipient.
  def publish_batch(conn, %{"ids" => ids}) when is_list(ids) do
    actor = conn.assigns.current_user

    shifts =
      ids
      |> Enum.map(&Scheduling.get_shift/1)
      |> Enum.reject(&is_nil/1)
      |> Enum.filter(&Authz.can?(actor, :publish, &1))

    {:ok, published} = Scheduling.publish_shifts(shifts)
    json(conn, %{data: Enum.map(published, &shift/1), count: length(published)})
  end

  def publish_batch(conn, _params) do
    conn |> put_status(:bad_request) |> json(%{error: "ids (list) required"})
  end

  def unpublish(conn, %{"id" => id}) do
    with_shift(conn, id, :unpublish, fn s ->
      with {:ok, updated} <- Scheduling.unpublish_shift(s) do
        json(conn, %{data: shift(updated)})
      end
    end)
  end

  def claim(conn, %{"id" => id}) do
    actor = conn.assigns.current_user

    case Scheduling.get_shift(id) do
      nil ->
        {:error, :not_found}

      %Shift{} = s ->
        cond do
          not Authz.can?(actor, :claim, s) ->
            forbidden(conn)

          true ->
            case Scheduling.claim_shift(s, actor) do
              {:ok, updated} ->
                json(conn, %{data: shift(updated)})

              {:error, :not_claimable} ->
                conn |> put_status(:conflict) |> json(%{error: "Shift is no longer open"})

              other ->
                other
            end
        end
    end
  end

  ## Helpers

  defp with_shift(conn, id, action, fun) do
    actor = conn.assigns.current_user

    case Scheduling.get_shift(id) do
      nil -> {:error, :not_found}
      %Shift{} = s -> if Authz.can?(actor, action, s), do: fun.(s), else: forbidden(conn)
    end
  end

  defp forbidden(conn) do
    conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
  end
end
