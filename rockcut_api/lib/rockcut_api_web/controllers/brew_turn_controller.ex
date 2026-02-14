defmodule RockcutApiWeb.BrewTurnController do
  use RockcutApiWeb, :controller

  alias RockcutApi.Brewing
  import RockcutApiWeb.JSONHelpers, only: [brew_turn: 1]

  action_fallback RockcutApiWeb.FallbackController

  def index(conn, %{"batch_id" => batch_id}) do
    turns = Brewing.list_brew_turns(batch_id)
    json(conn, %{data: Enum.map(turns, &brew_turn/1)})
  end

  def create(conn, params) do
    with {:ok, turn} <- Brewing.create_brew_turn(params) do
      conn
      |> put_status(:created)
      |> json(%{data: brew_turn(turn)})
    end
  end

  def show(conn, %{"id" => id}) do
    turn = Brewing.get_brew_turn!(id)
    json(conn, %{data: brew_turn(turn)})
  end

  def update(conn, %{"id" => id} = params) do
    turn = Brewing.get_brew_turn!(id)

    with {:ok, turn} <- Brewing.update_brew_turn(turn, params) do
      json(conn, %{data: brew_turn(turn)})
    end
  end

  def delete(conn, %{"id" => id}) do
    turn = Brewing.get_brew_turn!(id)

    with {:ok, _} <- Brewing.delete_brew_turn(turn) do
      send_resp(conn, :no_content, "")
    end
  end
end
