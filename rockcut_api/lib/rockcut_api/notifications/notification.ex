defmodule RockcutApi.Notifications.Notification do
  use Ecto.Schema
  import Ecto.Changeset

  schema "notifications" do
    field :event, :string
    field :title, :string
    field :body, :string
    field :data, :map, default: %{}
    field :read_at, :utc_datetime

    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(notification, attrs) do
    notification
    |> cast(attrs, [:user_id, :event, :title, :body, :data])
    |> validate_required([:user_id, :event, :title])
    |> foreign_key_constraint(:user_id)
  end
end
