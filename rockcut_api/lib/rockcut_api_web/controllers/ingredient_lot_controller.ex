defmodule RockcutApiWeb.IngredientLotController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [ingredient_lot: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    lots = Brewing.list_ingredient_lots(params)
    json(conn, %{data: Enum.map(lots, &ingredient_lot/1)})
  end

  def create(conn, params) do
    with {:ok, lot} <- Brewing.create_ingredient_lot(params) do
      conn
      |> put_status(:created)
      |> json(%{data: ingredient_lot(lot)})
    end
  end

  def show(conn, %{"id" => id}) do
    lot = Brewing.get_ingredient_lot!(id)
    json(conn, %{data: ingredient_lot(lot)})
  end

  def update(conn, %{"id" => id} = params) do
    lot = Brewing.get_ingredient_lot!(id)

    with {:ok, lot} <- Brewing.update_ingredient_lot(lot, params) do
      json(conn, %{data: ingredient_lot(lot)})
    end
  end

  def delete(conn, %{"id" => id}) do
    lot = Brewing.get_ingredient_lot!(id)

    with {:ok, _} <- Brewing.delete_ingredient_lot(lot) do
      send_resp(conn, :no_content, "")
    end
  end
end
