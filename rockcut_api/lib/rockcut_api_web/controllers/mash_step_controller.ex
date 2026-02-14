defmodule RockcutApiWeb.MashStepController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [mash_step: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, %{"recipe_id" => recipe_id}) do
    steps = Brewing.list_mash_steps(recipe_id)
    json(conn, %{data: Enum.map(steps, &mash_step/1)})
  end

  def create(conn, params) do
    with {:ok, step} <- Brewing.create_mash_step(params) do
      conn
      |> put_status(:created)
      |> json(%{data: mash_step(step)})
    end
  end

  def show(conn, %{"id" => id}) do
    step = Brewing.get_mash_step!(id)
    json(conn, %{data: mash_step(step)})
  end

  def update(conn, %{"id" => id} = params) do
    step = Brewing.get_mash_step!(id)

    with {:ok, step} <- Brewing.update_mash_step(step, params) do
      json(conn, %{data: mash_step(step)})
    end
  end

  def delete(conn, %{"id" => id}) do
    step = Brewing.get_mash_step!(id)

    with {:ok, _} <- Brewing.delete_mash_step(step) do
      send_resp(conn, :no_content, "")
    end
  end
end
