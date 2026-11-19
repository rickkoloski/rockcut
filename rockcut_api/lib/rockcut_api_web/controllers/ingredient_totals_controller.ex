defmodule RockcutApiWeb.IngredientTotalsController do
  @moduledoc """
  D61 §3.6: inventory totals as of a date (`/api/ingredient_totals/inventory`)
  and order totals (`/api/ingredient_totals/orders`). Any Brewery member.
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.{Orders, Valuation}

  action_fallback RockcutApiWeb.FallbackController

  def inventory(conn, params) do
    with {:ok, totals} <- Valuation.inventory_totals(params) do
      json(conn, %{data: totals})
    end
  end

  def orders(conn, params) do
    with {:ok, totals} <- Orders.order_totals(params) do
      json(conn, %{data: totals})
    end
  end
end
