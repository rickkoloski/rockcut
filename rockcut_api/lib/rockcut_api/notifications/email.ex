defmodule RockcutApi.Notifications.Email do
  @moduledoc "Builds a Swoosh email for a notification. Links to the app rather than embedding local times."
  import Swoosh.Email

  def build(user, _event, payload) do
    app_url = Application.get_env(:rockcut_api, :app_url, "http://localhost:5174")

    body =
      [payload.title, payload[:body], "", "Open your schedule: #{app_url}"]
      |> Enum.reject(&is_nil/1)
      |> Enum.join("\n")

    new()
    |> to({user.name || user.email, user.email})
    |> from({"Rockcut Schedule", from_address()})
    |> subject(payload.title)
    |> text_body(body <> "\n")
  end

  defp from_address, do: Application.get_env(:rockcut_api, :notify_from, "schedule@rockcut.com")
end
