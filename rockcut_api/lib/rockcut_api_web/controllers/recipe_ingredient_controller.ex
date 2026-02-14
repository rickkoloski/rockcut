defmodule RockcutApiWeb.RecipeIngredientController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [recipe_ingredient: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, %{"recipe_id" => recipe_id}) do
    items = Brewing.list_recipe_ingredients(recipe_id)
    json(conn, %{data: Enum.map(items, &recipe_ingredient/1)})
  end

  def create(conn, params) do
    with {:ok, ri} <- Brewing.create_recipe_ingredient(params) do
      conn
      |> put_status(:created)
      |> json(%{data: recipe_ingredient(ri)})
    end
  end

  def show(conn, %{"id" => id}) do
    ri = Brewing.get_recipe_ingredient!(id)
    json(conn, %{data: recipe_ingredient(ri)})
  end

  def update(conn, %{"id" => id} = params) do
    ri = Brewing.get_recipe_ingredient!(id)

    with {:ok, ri} <- Brewing.update_recipe_ingredient(ri, params) do
      json(conn, %{data: recipe_ingredient(ri)})
    end
  end

  def delete(conn, %{"id" => id}) do
    ri = Brewing.get_recipe_ingredient!(id)

    with {:ok, _} <- Brewing.delete_recipe_ingredient(ri) do
      send_resp(conn, :no_content, "")
    end
  end
end
