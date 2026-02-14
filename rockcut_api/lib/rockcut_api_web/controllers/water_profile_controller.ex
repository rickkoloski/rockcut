defmodule RockcutApiWeb.WaterProfileController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [water_profile: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, %{"recipe_id" => recipe_id}) do
    case Brewing.get_water_profile_by_recipe(recipe_id) do
      nil -> json(conn, %{data: nil})
      wp -> json(conn, %{data: water_profile(wp)})
    end
  end

  def create(conn, params) do
    with {:ok, wp} <- Brewing.create_water_profile(params) do
      conn
      |> put_status(:created)
      |> json(%{data: water_profile(wp)})
    end
  end

  def show(conn, %{"id" => id}) do
    wp = Brewing.get_water_profile!(id)
    json(conn, %{data: water_profile(wp)})
  end

  def update(conn, %{"id" => id} = params) do
    wp = Brewing.get_water_profile!(id)

    with {:ok, wp} <- Brewing.update_water_profile(wp, params) do
      json(conn, %{data: water_profile(wp)})
    end
  end

  def delete(conn, %{"id" => id}) do
    wp = Brewing.get_water_profile!(id)

    with {:ok, _} <- Brewing.delete_water_profile(wp) do
      send_resp(conn, :no_content, "")
    end
  end
end
