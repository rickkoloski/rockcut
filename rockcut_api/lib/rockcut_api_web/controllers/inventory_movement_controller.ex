defmodule RockcutApiWeb.InventoryMovementController do
  @moduledoc """
  D60 §3.7: movements, by product or lot (newest first), and recording one.
  Movements aren't updated or deleted: a wrong one is undone by an opposite
  movement or a count. Except a yeast pitch (D64, `Yeast.LotPitches`): each
  row says `can_remove` for the viewer.
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.Inventory
  import RockcutApiWeb.JSONHelpers, only: [inventory_movement: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    with {:ok, movements} <- Inventory.list_movements(params) do
      removable =
        RockcutApi.Yeast.LotPitches.removable_ids(movements, conn.assigns.current_user)

      json(conn, %{
        data:
          Enum.map(movements, fn m ->
            m |> inventory_movement() |> Map.put(:can_remove, MapSet.member?(removable, m.id))
          end)
      })
    end
  end

  @doc "One movement per lot touched (oldest first can touch several)."
  def create(conn, params) do
    with {:ok, movements} <- Inventory.create_movement(params, conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: Enum.map(movements, &inventory_movement/1)})
    end
  end
end
