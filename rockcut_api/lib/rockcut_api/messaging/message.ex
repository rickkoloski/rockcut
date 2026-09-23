defmodule RockcutApi.Messaging.Message do
  @moduledoc "A message in a pre-defined channel, identified by `channel_key` (D23)."
  use Ecto.Schema
  import Ecto.Changeset

  schema "messages" do
    field :channel_key, :string
    field :body, :string

    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(message, attrs) do
    message
    |> cast(attrs, [:channel_key, :user_id, :body])
    |> update_change(:body, &String.trim/1)
    |> validate_required([:channel_key, :user_id, :body])
    |> validate_length(:body, min: 1, max: 4000)
  end
end
