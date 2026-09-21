defmodule RockcutApiWeb.CalendarFeedController do
  use RockcutApiWeb, :controller

  alias RockcutApi.CalendarFeeds

  def index(conn, _params) do
    feeds = CalendarFeeds.feeds_for(conn.assigns.current_user)
    json(conn, %{data: Enum.map(feeds, &to_json/1)})
  end

  def rotate(conn, %{"subject_type" => subject_type} = params) do
    subject_id = normalize_id(params["subject_id"])

    case CalendarFeeds.rotate(subject_type, subject_id, conn.assigns.current_user) do
      {:ok, feed} ->
        json(conn, %{
          data: %{
            subject_type: feed.subject_type,
            subject_id: feed.subject_id,
            token: feed.token,
            path: path_for(feed.token)
          }
        })

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Could not rotate"})
    end
  end

  defp to_json(%{subject_type: st, subject_id: sid, label: label, token: token}) do
    %{subject_type: st, subject_id: sid, label: label, token: token, path: path_for(token)}
  end

  defp path_for(token), do: "/api/calendar/#{token}.ics"

  defp normalize_id(nil), do: nil
  defp normalize_id(""), do: nil
  defp normalize_id(id) when is_integer(id), do: id
  defp normalize_id(id) when is_binary(id), do: String.to_integer(id)
end
