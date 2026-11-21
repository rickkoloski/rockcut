defmodule RockcutApiWeb.IngredientController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  alias RockcutApi.Ingredients.Ions
  import RockcutApiWeb.JSONHelpers, only: [ingredient: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    ingredients = Brewing.list_ingredients(params)
    ions = Ions.by_ingredient(Enum.map(ingredients, & &1.id))

    json(conn, %{
      data: Enum.map(ingredients, &ingredient(%{&1 | ions: Map.get(ions, &1.id, %{})}))
    })
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
    json(conn, %{data: ingredient(%{ing | ions: Ions.get(ing.id)})})
  end

  @doc "D65: a Water Salts ingredient's ion values, `%{key => value}`."
  def ions(conn, %{"id" => id}) do
    ing = Brewing.get_ingredient!(id)
    json(conn, %{data: Ions.get(ing.id)})
  end

  @doc "D65: set ion values (`%{\"ions\" => %{key => value | nil}}`); 422 outside Water Salts."
  def put_ions(conn, %{"id" => id} = params) do
    ing = Brewing.get_ingredient!(id)

    with {:ok, ions} <- Ions.put(ing, Map.get(params, "ions", %{})) do
      json(conn, %{data: ions})
    end
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
