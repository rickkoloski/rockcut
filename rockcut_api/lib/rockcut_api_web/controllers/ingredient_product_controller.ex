defmodule RockcutApiWeb.IngredientProductController do
  @moduledoc """
  D60 §3.3: products, and a count of one (§3.8,
  `POST /api/ingredient_products/:id/count`). D64 §4.6: a pitch of purchased
  yeast into a batch (`POST /api/ingredient_products/:id/pitch`).
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.{Inventory, Products}
  import RockcutApiWeb.JSONHelpers, only: [ingredient_product: 1, inventory_movement: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Products.list(params), &ingredient_product/1)})
  end

  def create(conn, params) do
    with {:ok, product} <- Products.create(params) do
      conn |> put_status(:created) |> json(%{data: ingredient_product(product)})
    end
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: ingredient_product(Products.get!(id))})
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, product} <- Products.update(Products.get!(id), params) do
      json(conn, %{data: ingredient_product(product)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, _} <- Products.delete(Products.get!(id)) do
      send_resp(conn, :no_content, "")
    end
  end

  @doc "D64 §4.6: the `used` movements a pitch of purchased yeast wrote (one per lot)."
  def pitch(conn, %{"id" => id} = params) do
    product = Products.get!(id)

    with {:ok, movements} <- Inventory.pitch(product, params, conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: Enum.map(movements, &inventory_movement/1)})
    end
  end

  @doc "The adjustments a count wrote (none when nothing differed)."
  def count(conn, %{"id" => id} = params) do
    product = Products.get!(id)

    with {:ok, adjustments} <- Inventory.count(product, params, conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: Enum.map(adjustments, &inventory_movement/1)})
    end
  end
end
