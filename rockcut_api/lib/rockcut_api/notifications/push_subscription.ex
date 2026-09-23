defmodule RockcutApi.Notifications.PushSubscription do
  @moduledoc "A single browser/device Web Push subscription for a user (D21)."
  use Ecto.Schema
  import Ecto.Changeset

  schema "push_subscriptions" do
    field :endpoint, :string
    field :p256dh, :string
    field :auth, :string
    field :user_agent, :string

    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(subscription, attrs) do
    subscription
    |> cast(attrs, [:user_id, :endpoint, :p256dh, :auth, :user_agent])
    |> validate_required([:user_id, :endpoint, :p256dh, :auth])
    |> unique_constraint(:endpoint)
  end
end
