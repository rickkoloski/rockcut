defmodule RockcutApiWeb.BrandController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [brand: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, _params) do
    brands = Brewing.list_brands()
    json(conn, %{data: Enum.map(brands, &brand/1)})
  end

  def create(conn, params) do
    with {:ok, b} <- Brewing.create_brand(params) do
      conn
      |> put_status(:created)
      |> json(%{data: brand(b)})
    end
  end

  def show(conn, %{"id" => id}) do
    b = Brewing.get_brand!(id)
    json(conn, %{data: brand(b)})
  end

  def update(conn, %{"id" => id} = params) do
    b = Brewing.get_brand!(id)

    with {:ok, b} <- Brewing.update_brand(b, params) do
      json(conn, %{data: brand(b)})
    end
  end

  def delete(conn, %{"id" => id}) do
    b = Brewing.get_brand!(id)

    with {:ok, _} <- Brewing.delete_brand(b) do
      send_resp(conn, :no_content, "")
    end
  end
end
