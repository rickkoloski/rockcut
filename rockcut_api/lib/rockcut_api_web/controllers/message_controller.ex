defmodule RockcutApiWeb.MessageController do
  use RockcutApiWeb, :controller

  import RockcutApiWeb.JSONHelpers, only: [message: 1]
  alias RockcutApi.Messaging

  action_fallback RockcutApiWeb.FallbackController

  @doc "Channels visible to the caller, each with an unread count."
  def channels(conn, _params) do
    user = conn.assigns.current_user
    unread = Messaging.unread_counts(user)

    channels =
      user
      |> Messaging.channels_for()
      |> Enum.map(fn c -> Map.put(c, :unread, Map.get(unread, c.key, 0)) end)

    json(conn, %{data: channels})
  end

  def index(conn, %{"key" => key} = params) do
    opts = if b = params["before"], do: [before: String.to_integer(b)], else: []

    case Messaging.list_messages(conn.assigns.current_user, key, opts) do
      {:ok, messages} -> json(conn, %{data: Enum.map(messages, &message/1)})
      {:error, :forbidden} -> forbidden(conn)
    end
  end

  def create(conn, %{"key" => key, "body" => body}) do
    case Messaging.post_message(conn.assigns.current_user, key, body) do
      {:ok, msg} -> conn |> put_status(:created) |> json(%{data: message(msg)})
      {:error, :forbidden} -> forbidden(conn)
      {:error, %Ecto.Changeset{} = cs} -> {:error, cs}
    end
  end

  def create(conn, _params),
    do: conn |> put_status(:bad_request) |> json(%{error: "body required"})

  def read(conn, %{"key" => key}) do
    case Messaging.mark_read(conn.assigns.current_user, key) do
      :ok -> send_resp(conn, :no_content, "")
      {:error, :forbidden} -> forbidden(conn)
    end
  end

  def unread_count(conn, _params) do
    json(conn, %{count: Messaging.total_unread(conn.assigns.current_user)})
  end

  defp forbidden(conn), do: conn |> put_status(:forbidden) |> json(%{error: "Forbidden"})
end
