defmodule RockcutApi.Messaging.ChannelRead do
  @moduledoc "Per-user last-read marker for a channel (D23)."
  use Ecto.Schema
  import Ecto.Changeset

  schema "channel_reads" do
    field :channel_key, :string
    field :last_read_message_id, :integer

    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(read, attrs) do
    read
    |> cast(attrs, [:user_id, :channel_key, :last_read_message_id])
    |> validate_required([:user_id, :channel_key])
    |> unique_constraint([:user_id, :channel_key])
  end
end
