defmodule RockcutApiWeb.CalendarController do
  @moduledoc "Public ICS feed — fetched anonymously by calendar apps; the token is the credential."
  use RockcutApiWeb, :controller

  alias RockcutApi.CalendarFeeds

  def feed(conn, %{"token" => token}) do
    token = String.replace_suffix(token, ".ics", "")

    case CalendarFeeds.get_feed_by_token(token) do
      nil ->
        conn |> put_status(:not_found) |> text("Not found")

      feed ->
        conn
        |> put_resp_content_type("text/calendar")
        |> send_resp(200, CalendarFeeds.ics(feed))
    end
  end
end
