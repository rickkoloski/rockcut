defmodule RockcutApiWeb.BrewhouseController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [brewhouse: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    brewhouses = Brewing.list_brewhouses()
    json(conn, %{data: Enum.map(brewhouses, &brewhouse/1)})
  end

  def create(conn, params) do
    with {:ok, b} <- Brewing.create_brewhouse(params) do
      conn
      |> put_status(:created)
      |> json(%{data: brewhouse(b)})
    end
  end

  def show(conn, %{"id" => id}) do
    b = Brewing.get_brewhouse!(id)
    json(conn, %{data: brewhouse(b)})
  end

  def update(conn, %{"id" => id} = params) do
    b = Brewing.get_brewhouse!(id)

    with {:ok, b} <- Brewing.update_brewhouse(b, params) do
      json(conn, %{data: brewhouse(b)})
    end
  end

  def delete(conn, %{"id" => id}) do
    b = Brewing.get_brewhouse!(id)

    with {:ok, _} <- Brewing.delete_brewhouse(b) do
      send_resp(conn, :no_content, "")
    end
  end
end
