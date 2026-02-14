defmodule RockcutApiWeb.IngredientCategoryController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [ingredient_category: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    categories = Brewing.list_ingredient_categories()
    json(conn, %{data: Enum.map(categories, &ingredient_category/1)})
  end

  def create(conn, params) do
    with {:ok, category} <- Brewing.create_ingredient_category(params) do
      conn
      |> put_status(:created)
      |> json(%{data: ingredient_category(category)})
    end
  end

  def show(conn, %{"id" => id}) do
    category = Brewing.get_ingredient_category!(id)
    json(conn, %{data: ingredient_category(category)})
  end

  def update(conn, %{"id" => id} = params) do
    category = Brewing.get_ingredient_category!(id)

    with {:ok, category} <- Brewing.update_ingredient_category(category, params) do
      json(conn, %{data: ingredient_category(category)})
    end
  end

  def delete(conn, %{"id" => id}) do
    category = Brewing.get_ingredient_category!(id)

    with {:ok, _} <- Brewing.delete_ingredient_category(category) do
      send_resp(conn, :no_content, "")
    end
  end
end
