defmodule RockcutApiWeb.BatchController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [batch: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    batches = Brewing.list_batches(params)
    json(conn, %{data: Enum.map(batches, &batch/1)})
  end

  def create(conn, params) do
    with {:ok, b} <- Brewing.create_batch(params) do
      conn
      |> put_status(:created)
      |> json(%{data: batch(b)})
    end
  end

  def show(conn, %{"id" => id}) do
    b = Brewing.get_batch!(id)
    json(conn, %{data: batch(b)})
  end

  def update(conn, %{"id" => id} = params) do
    b = Brewing.get_batch!(id)

    with {:ok, b} <- Brewing.update_batch(b, params) do
      json(conn, %{data: batch(b)})
    end
  end

  def delete(conn, %{"id" => id}) do
    b = Brewing.get_batch!(id)

    with {:ok, _} <- Brewing.delete_batch(b) do
      send_resp(conn, :no_content, "")
    end
  end
end
