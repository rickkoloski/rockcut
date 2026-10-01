defmodule RockcutApiWeb.DeviceGate do
  @moduledoc """
  Gate 1 of D33's two deny-by-default gates: part of the `:authenticated`
  pipeline, it refuses shared-device accounts with 403 on every route. The
  few routes a device may use live in the router's `:device_allowed` scope,
  which doesn't run this plug, so a route added later stays closed to
  devices unless someone deliberately opens it. Runs after `AuthPlug`.
  """
  import Plug.Conn
  alias RockcutApi.Authz

  def init(opts), do: opts

  def call(conn, _opts) do
    if Authz.device?(conn.assigns[:current_user]) do
      conn
      |> put_status(:forbidden)
      |> Phoenix.Controller.json(%{error: "Not available on a shared device"})
      |> halt()
    else
      conn
    end
  end
end
