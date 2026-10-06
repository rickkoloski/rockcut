defmodule RockcutApiWeb.BeerBoardAdminController do
  @moduledoc """
  Buy-a-Beer Board management (D37 §3.4): the change log now; CSV import and
  export join it in step 5. Owners and Taproom managers only, signed in as
  themselves (the `:authenticated` scope: a shared device never gets here,
  whatever staff code it holds).
  """
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [beer_board_event: 1]
  alias RockcutApi.{Authz, BeerBoard}

  def history(conn, params) do
    if Authz.can?(conn.assigns.current_user, :history, :beer_board) do
      page =
        case Integer.parse(to_string(params["page"] || "1")) do
          {n, ""} when n >= 1 -> n
          _ -> 1
        end

      %{events: events, page: page, total: total} = BeerBoard.list_events(params["q"], page)

      json(conn, %{
        data: Enum.map(events, &beer_board_event/1),
        page: page,
        total: total,
        per_page: 50
      })
    else
      conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
    end
  end
end
