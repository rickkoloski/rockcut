defmodule RockcutApiWeb.PartyController do
  @moduledoc "D60 §3.2: Brewery → Ingredients → Companies (parties and their roles)."
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.Parties
  import RockcutApiWeb.JSONHelpers, only: [party: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Parties.list(params), &party/1)})
  end

  def create(conn, params) do
    with {:ok, party} <- Parties.create(params) do
      conn |> put_status(:created) |> json(%{data: party(party)})
    end
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: party(Parties.get!(id))})
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, party} <- Parties.update(Parties.get!(id), params) do
      json(conn, %{data: party(party)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, _} <- Parties.delete(Parties.get!(id)) do
      send_resp(conn, :no_content, "")
    end
  end
end
