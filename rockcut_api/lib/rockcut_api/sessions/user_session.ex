defmodule RockcutApi.Sessions.UserSession do
  @moduledoc "A person's sign-in (D34). Only the HMAC hash of the `ses_` token is stored."
  use Ecto.Schema

  schema "user_sessions" do
    field :token_hash, :binary, redact: true
    field :expires_at, :utc_datetime
    field :last_seen_at, :utc_datetime
    field :revoked_at, :utc_datetime

    belongs_to :user, RockcutApi.Accounts.User
    # Set when the sign-in was made on a paired tablet ("Sign in as me").
    belongs_to :device_token, RockcutApi.Devices.DeviceToken

    timestamps(type: :utc_datetime)
  end
end
