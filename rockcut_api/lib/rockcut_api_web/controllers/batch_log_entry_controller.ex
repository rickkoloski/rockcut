defmodule RockcutApiWeb.BatchLogEntryController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [batch_log_entry: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, %{"batch_id" => batch_id}) do
    entries = Brewing.list_batch_log_entries(batch_id)
    json(conn, %{data: Enum.map(entries, &batch_log_entry/1)})
  end

  def create(conn, params) do
    with {:ok, entry} <- Brewing.create_batch_log_entry(params) do
      conn
      |> put_status(:created)
      |> json(%{data: batch_log_entry(entry)})
    end
  end

  def show(conn, %{"id" => id}) do
    entry = Brewing.get_batch_log_entry!(id)
    json(conn, %{data: batch_log_entry(entry)})
  end

  def update(conn, %{"id" => id} = params) do
    entry = Brewing.get_batch_log_entry!(id)

    with {:ok, entry} <- Brewing.update_batch_log_entry(entry, params) do
      json(conn, %{data: batch_log_entry(entry)})
    end
  end

  def delete(conn, %{"id" => id}) do
    entry = Brewing.get_batch_log_entry!(id)

    with {:ok, _} <- Brewing.delete_batch_log_entry(entry) do
      send_resp(conn, :no_content, "")
    end
  end
end
