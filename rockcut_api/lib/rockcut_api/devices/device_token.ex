defmodule RockcutApi.Devices.DeviceToken do
  @moduledoc "A paired tablet's token (D33). Only the HMAC hash is stored."
  use Ecto.Schema

  schema "device_tokens" do
    field :name, :string
    field :token_hash, :binary, redact: true
    field :last_seen_at, :utc_datetime
    field :revoked_at, :utc_datetime

    belongs_to :user, RockcutApi.Accounts.User
    belongs_to :paired_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end
end
