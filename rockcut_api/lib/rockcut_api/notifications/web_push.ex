defmodule RockcutApi.Notifications.WebPush do
  @moduledoc """
  Web Push channel (D21): per-device subscriptions + VAPID-signed delivery.

  Sends via `Req`, and prunes any subscription the push service reports as gone
  (HTTP 404/410). Delivery is best-effort — callers wrap it in a `Task`. When no
  VAPID keypair is configured, delivery is a no-op.
  """
  import Ecto.Query
  require Logger
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.Notifications.PushSubscription

  @doc "The configured VAPID public key, or nil when web push isn't configured."
  def vapid_public_key do
    :web_push_ex
    |> Application.get_env(:vapid, [])
    |> Keyword.get(:public_key)
  end

  def configured?, do: is_binary(vapid_public_key())

  ## Subscriptions

  def list(%User{} = user) do
    from(s in PushSubscription, where: s.user_id == ^user.id) |> Repo.all()
  end

  @doc "Upsert a device subscription. Identity is the endpoint (one row per device)."
  def subscribe(%User{} = user, attrs) do
    %PushSubscription{}
    |> PushSubscription.changeset(Map.put(attrs, :user_id, user.id))
    |> Repo.insert(
      on_conflict: {:replace, [:user_id, :p256dh, :auth, :user_agent, :updated_at]},
      conflict_target: :endpoint
    )
  end

  def unsubscribe(%User{} = user, endpoint) when is_binary(endpoint) do
    from(s in PushSubscription, where: s.user_id == ^user.id and s.endpoint == ^endpoint)
    |> Repo.delete_all()

    :ok
  end

  ## Delivery

  @doc "Send `payload` (%{title, body, data}) to every device the user has subscribed."
  def deliver(%User{} = user, payload) do
    if configured?() do
      for sub <- list(user), do: push(sub, payload)
    end

    :ok
  end

  defp push(%PushSubscription{} = sub, payload) do
    message =
      Jason.encode!(%{
        title: payload.title,
        body: payload[:body],
        data: payload[:data] || %{}
      })

    request = sub |> to_web_push_subscription() |> WebPushEx.request(message)

    case sender().(request) do
      {:ok, status} when status in [404, 410] -> Repo.delete(sub)
      {:ok, _status} -> :ok
      {:error, reason} -> Logger.warning("web push send error: #{inspect(reason)}")
    end
  rescue
    e -> Logger.error("web push failed: #{inspect(e)}")
  end

  defp to_web_push_subscription(%PushSubscription{} = sub) do
    WebPushEx.Subscription.from_json(
      Jason.encode!(%{endpoint: sub.endpoint, keys: %{p256dh: sub.p256dh, auth: sub.auth}})
    )
  end

  # The HTTP send is injectable so tests assert delivery + pruning without a network.
  # Configure with: config :rockcut_api, RockcutApi.Notifications.WebPush, sender: fn req -> {:ok, 201} end
  defp sender do
    Application.get_env(:rockcut_api, __MODULE__, [])[:sender] || (&default_send/1)
  end

  defp default_send(%WebPushEx.Request{} = request) do
    case Req.post(URI.to_string(request.endpoint), headers: request.headers, body: request.body) do
      {:ok, %Req.Response{status: status}} -> {:ok, status}
      {:error, reason} -> {:error, reason}
    end
  end
end
