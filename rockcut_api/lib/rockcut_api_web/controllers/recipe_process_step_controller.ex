defmodule RockcutApiWeb.RecipeProcessStepController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [recipe_process_step: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, %{"recipe_id" => recipe_id}) do
    steps = Brewing.list_recipe_process_steps(recipe_id)
    json(conn, %{data: Enum.map(steps, &recipe_process_step/1)})
  end

  def create(conn, params) do
    with {:ok, step} <- Brewing.create_recipe_process_step(params) do
      conn
      |> put_status(:created)
      |> json(%{data: recipe_process_step(step)})
    end
  end

  def show(conn, %{"id" => id}) do
    step = Brewing.get_recipe_process_step!(id)
    json(conn, %{data: recipe_process_step(step)})
  end

  def update(conn, %{"id" => id} = params) do
    step = Brewing.get_recipe_process_step!(id)

    with {:ok, step} <- Brewing.update_recipe_process_step(step, params) do
      json(conn, %{data: recipe_process_step(step)})
    end
  end

  def delete(conn, %{"id" => id}) do
    step = Brewing.get_recipe_process_step!(id)

    with {:ok, _} <- Brewing.delete_recipe_process_step(step) do
      send_resp(conn, :no_content, "")
    end
  end
end
