defmodule RockcutApiWeb.SupplierOfferController do
  @moduledoc """
  D60 §3.6: supplier offers, and their prices
  (`/api/supplier_offers/:id/prices`: newest first; a change adds a row).
  """
  use RockcutApiWeb, :controller

  alias RockcutApi.Ingredients.Offers
  import RockcutApiWeb.JSONHelpers, only: [supplier_offer: 1, offer_price: 2]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, params) do
    json(conn, %{data: Enum.map(Offers.list(params), &supplier_offer/1)})
  end

  def create(conn, params) do
    with {:ok, offer} <- Offers.create(params) do
      conn |> put_status(:created) |> json(%{data: supplier_offer(offer)})
    end
  end

  def show(conn, %{"id" => id}) do
    json(conn, %{data: supplier_offer(Offers.get!(id))})
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, offer} <- Offers.update(Offers.get!(id), params) do
      json(conn, %{data: supplier_offer(offer)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, _} <- Offers.delete(Offers.get!(id)) do
      send_resp(conn, :no_content, "")
    end
  end

  def prices(conn, %{"id" => id}) do
    offer = Offers.get!(id)
    prices = Offers.list_prices(offer)
    json(conn, %{data: Enum.map(prices, &offer_price(&1, offer.pack_size))})
  end

  def create_price(conn, %{"id" => id} = params) do
    offer = Offers.get!(id)

    with {:ok, price} <-
           Offers.create_price(offer, Map.delete(params, "id"), conn.assigns.current_user) do
      conn |> put_status(:created) |> json(%{data: offer_price(price, offer.pack_size)})
    end
  end
end
