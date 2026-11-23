defmodule RockcutApiWeb.BatchController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  alias RockcutApiWeb.ProductionErrors
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

    case Brewing.delete_batch(b) do
      {:ok, _} ->
        send_resp(conn, :no_content, "")

      # Production's sentence, in the shape the batch page shows.
      {:error, code} when code in [:split_part, :split] ->
        {:error, {:invalid, %{base: [ProductionErrors.message(code)]}}}

      error ->
        error
    end
  end
end
