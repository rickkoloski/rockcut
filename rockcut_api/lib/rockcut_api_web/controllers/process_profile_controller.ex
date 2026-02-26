defmodule RockcutApiWeb.ProcessProfileController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [process_profile: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    profiles = Brewing.list_process_profiles()
    json(conn, %{data: Enum.map(profiles, &process_profile/1)})
  end

  def create(conn, params) do
    with {:ok, p} <- Brewing.create_process_profile(params) do
      conn
      |> put_status(:created)
      |> json(%{data: process_profile(p)})
    end
  end

  def show(conn, %{"id" => id}) do
    p = Brewing.get_process_profile!(id)
    json(conn, %{data: process_profile(p)})
  end

  def update(conn, %{"id" => id} = params) do
    p = Brewing.get_process_profile!(id)

    with {:ok, p} <- Brewing.update_process_profile(p, params) do
      json(conn, %{data: process_profile(p)})
    end
  end

  def delete(conn, %{"id" => id}) do
    p = Brewing.get_process_profile!(id)

    with {:ok, _} <- Brewing.delete_process_profile(p) do
      send_resp(conn, :no_content, "")
    end
  end
end
