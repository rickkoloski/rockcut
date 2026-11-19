defmodule RockcutApiWeb.PurchaseOrderController do
  @moduledoc """
  D61 §3.2–3.3: purchase orders (`/api/purchase_orders`, lines in the body
  as a full list), `POST …/:id/cancel` and `POST …/:id/receive`. Any Brewery
  member (decision 46; the `:brewery` module plug); a received or cancelled
  order answers 409 to any write.
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.Orders
  import RockcutApiWeb.JSONHelpers, only: [purchase_order: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Orders.list(params), &purchase_order/1)})
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: purchase_order(Orders.get!(id))})
  end

  def create(conn, params) do
    with {:ok, order} <- Orders.create(params, conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: purchase_order(order)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, order} <- Orders.update(Orders.get!(id), Map.delete(params, "id")) do
      json(conn, %{data: purchase_order(order)})
    end
  end

  def cancel(conn, %{"id" => id}) do
    with {:ok, order} <- Orders.cancel(Orders.get!(id), conn.assigns.current_user) do
      json(conn, %{data: purchase_order(order)})
    end
  end

  def receive(conn, %{"id" => id} = params) do
    with {:ok, order} <-
           Orders.receive(Orders.get!(id), Map.delete(params, "id"), conn.assigns.current_user) do
      json(conn, %{data: purchase_order(order)})
    end
  end
end
