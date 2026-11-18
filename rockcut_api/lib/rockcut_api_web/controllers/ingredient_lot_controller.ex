defmodule RockcutApiWeb.IngredientLotController do
  @moduledoc """
  Ingredient lots. D60 §3.7: a grain lot is of a maltster product, from a
  supplier, with its features and on-hand; creating one records its first
  movement (`Ingredients.Inventory.create_lot/2`).
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.Inventory
  import RockcutApiWeb.JSONHelpers, only: [ingredient_lot: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Inventory.list_lots(params), &ingredient_lot/1)})
  end

  def create(conn, params) do
    with {:ok, lot} <- Inventory.create_lot(params, conn.assigns.current_user) do
      conn
      |> put_status(:created)
      |> json(%{data: ingredient_lot(lot)})
    end
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: ingredient_lot(Inventory.get_lot!(id))})
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, lot} <- Inventory.update_lot(Inventory.get_lot!(id), Map.delete(params, "id")) do
      json(conn, %{data: ingredient_lot(lot)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, _} <- Inventory.delete_lot(Inventory.get_lot!(id)) do
      send_resp(conn, :no_content, "")
    end
  end
end
