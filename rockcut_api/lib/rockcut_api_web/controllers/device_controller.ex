defmodule RockcutApiWeb.DeviceController do
  @moduledoc """
  Admin → Shared devices (D33). Owners create, rename, deactivate and delete
  device accounts; owners and managers of a device's home department see it
  and generate pairing codes.
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [device: 1]
  alias RockcutApi.{Authz, Devices}

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    json(conn, %{data: Enum.map(Devices.list_devices(conn.assigns.current_user), &device/1)})
  end

  def create(conn, params) do
    actor = conn.assigns.current_user

    # Owner-only: no rule grants :create on :devices, so only the owner shortcut passes.
    if Authz.can?(actor, :create, :devices) do
      with {:ok, d} <-
             Devices.create_device(Map.take(params, ["name", "home_department_id"]), actor) do
        conn |> put_status(:created) |> json(%{data: device(d)})
      end
    else
      forbidden(conn)
    end
  end

  def update(conn, %{"id" => id} = params) do
    with_device(conn, id, :manage_device, fn actor, d ->
      attrs = Map.take(params, ["name", "home_department_id", "active"])

      with {:ok, updated} <- Devices.update_device(d, attrs, actor) do
        json(conn, %{data: device(updated)})
      end
    end)
  end

  def delete(conn, %{"id" => id}) do
    with_device(conn, id, :manage_device, fn actor, d ->
      {:ok, :ok} = Devices.delete_device(d, actor)
      send_resp(conn, :no_content, "")
    end)
  end

  def pairing_code(conn, %{"id" => id}) do
    with_device(conn, id, :pair, fn actor, d ->
      if d.active do
        {:ok, code, expires_at} = Devices.create_pairing_code(d, actor)
        conn |> put_status(:created) |> json(%{code: code, expires_at: expires_at})
      else
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: %{base: ["Reactivate this device before pairing a tablet"]}})
      end
    end)
  end

  # Not a device, or one the actor can't see → 404; visible but not allowed → 403.
  defp with_device(conn, id, action, fun) do
    actor = conn.assigns.current_user

    case Devices.get_device(id) do
      nil ->
        {:error, :not_found}

      d ->
        cond do
          not Authz.can?(actor, :view_device, d) -> {:error, :not_found}
          not Authz.can?(actor, action, d) -> forbidden(conn)
          true -> fun.(actor, d)
        end
    end
  end

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
end
