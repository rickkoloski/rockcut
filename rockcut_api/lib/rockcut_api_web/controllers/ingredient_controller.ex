defmodule RockcutApiWeb.IngredientController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [ingredient: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    ingredients = Brewing.list_ingredients(params)
    json(conn, %{data: Enum.map(ingredients, &ingredient/1)})
  end

  def create(conn, params) do
    with {:ok, ing} <- Brewing.create_ingredient(params) do
      conn
      |> put_status(:created)
      |> json(%{data: ingredient(ing)})
    end
  end

  def show(conn, %{"id" => id}) do
    ing = Brewing.get_ingredient!(id)
    json(conn, %{data: ingredient(ing)})
  end

  def update(conn, %{"id" => id} = params) do
    ing = Brewing.get_ingredient!(id)

    with {:ok, ing} <- Brewing.update_ingredient(ing, params) do
      json(conn, %{data: ingredient(ing)})
    end
  end

  def delete(conn, %{"id" => id}) do
    ing = Brewing.get_ingredient!(id)

    with {:ok, _} <- Brewing.delete_ingredient(ing) do
      send_resp(conn, :no_content, "")
    end
  end
end
