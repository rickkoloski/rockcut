defmodule RockcutApiWeb.HopUseListController do
  @moduledoc """
  D63 §4.2: a hop's use lists (`/api/hop_use_lists`). `index` is a read and
  `order` a write of `:ingredients` (`Authz`): any Brewery member and owners.
  No device does either (the `:brewery` scope, `DeviceGate`, `Authz.Device`).
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Authz
  alias RockcutApi.Ingredients.UseOrder
  import RockcutApiWeb.JSONHelpers, only: [hop_use_list: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    with :ok <- allow(conn, :read),
         {:ok, id} <- ingredient_id(params["ingredient_id"]) do
      json(conn, %{data: Enum.map(UseOrder.list(id), &hop_use_list/1)})
    end
  end

  def order(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, list} <- UseOrder.reorder(params) do
      json(conn, %{data: hop_use_list(list)})
    end
  end

  defp ingredient_id(id) do
    case RockcutApi.Ids.parse(id) do
      id when is_integer(id) -> {:ok, id}
      _ -> {:error, {:invalid, %{ingredient_id: ["can't be blank"]}}}
    end
  end

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :ingredients),
      do: :ok,
      else: {:error, :forbidden}
  end
end
