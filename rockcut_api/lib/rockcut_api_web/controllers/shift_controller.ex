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
    dept_id = params["department_id"]

    # Authorize against the target department before insert.
    if dept_id &&
         Authz.can?(actor, :create, %Shift{department_id: to_int(dept_id), status: "draft"}) do
      with {:ok, s} <- Scheduling.create_shift(params, actor) do
        conn |> put_status(:created) |> json(%{data: shift(s)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    with_shift(conn, id, :update, fn s ->
      with {:ok, updated} <- Scheduling.update_shift(s, Map.drop(params, ["id"])) do
        json(conn, %{data: shift(updated)})
      end
    end)
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

  defp to_int(v) when is_integer(v), do: v
  defp to_int(v) when is_binary(v), do: String.to_integer(v)
end
