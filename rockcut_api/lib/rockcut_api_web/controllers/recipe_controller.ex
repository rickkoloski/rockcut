defmodule RockcutApiWeb.RecipeController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [recipe: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    recipes = Brewing.list_recipes(params)
    json(conn, %{data: Enum.map(recipes, &recipe/1)})
  end

  def create(conn, params) do
    with {:ok, r} <- Brewing.create_recipe(params) do
      conn
      |> put_status(:created)
      |> json(%{data: recipe(r)})
    end
  end

  def show(conn, %{"id" => id}) do
    r = Brewing.get_recipe!(id)
    json(conn, %{data: recipe(r)})
  end

  def update(conn, %{"id" => id} = params) do
    r = Brewing.get_recipe!(id)

    with {:ok, r} <- Brewing.update_recipe(r, params) do
      json(conn, %{data: recipe(r)})
    end
  end

  def delete(conn, %{"id" => id}) do
    r = Brewing.get_recipe!(id)

    with {:ok, _} <- Brewing.delete_recipe(r) do
      send_resp(conn, :no_content, "")
    end
  end
end
