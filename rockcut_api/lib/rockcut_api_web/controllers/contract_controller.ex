defmodule RockcutApiWeb.ContractController do
  @moduledoc """
  D61 §3.1: malt contracts (`/api/contracts`, `?year=`, lines in the body as
  a full list) and the year's shortfall (`/api/contracts/shortfall?year=`).
  Any Brewery member reads; owners and Brewery managers write (`Authz`
  `:contracts`, decision 25).
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Authz
  alias RockcutApi.Ingredients.Contracts
  import RockcutApiWeb.JSONHelpers, only: [contract: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    # `can_write`: whether this person sees New / Edit / Delete (D61 §4.2);
    # `years`: every year with a contract, for the Year picker (lead decisions 2, gap 3).
    with :ok <- allow(conn, :read) do
      json(conn, %{
        data: Enum.map(Contracts.list(params), &contract/1),
        year: Contracts.year(params["year"]),
        years: Contracts.years(),
        can_write: Authz.can?(conn.assigns.current_user, :write, :contracts)
      })
    end
  end

  def shortfall(conn, params) do
    with :ok <- allow(conn, :read) do
      json(conn, %{year: Contracts.year(params["year"]), data: Contracts.shortfall(params)})
    end
  end

  def show(conn, %{"id" => id}) do
    with :ok <- allow(conn, :read) do
      json(conn, %{data: contract(Contracts.get!(id))})
    end
  end

  def create(conn, params) do
    with :ok <- allow(conn, :write),
         {:ok, c} <- Contracts.create(params, conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: contract(c)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with :ok <- allow(conn, :write),
         {:ok, c} <-
           Contracts.update(
             Contracts.get!(id),
             Map.delete(params, "id"),
             conn.assigns.current_user
           ) do
      json(conn, %{data: contract(c)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- allow(conn, :write),
         {:ok, _} <- Contracts.delete(Contracts.get!(id)) do
      send_resp(conn, :no_content, "")
    end
  end

  defp allow(conn, action) do
    if Authz.can?(conn.assigns.current_user, action, :contracts),
      do: :ok,
      else: {:error, :forbidden}
  end
end
