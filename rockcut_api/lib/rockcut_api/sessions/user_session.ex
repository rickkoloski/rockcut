defmodule RockcutApi.Sessions.UserSession do
  @moduledoc "A person's sign-in (D34). Only the HMAC hash of the `ses_` token is stored."
  use Ecto.Schema

  schema "user_sessions" do
    field :token_hash, :binary, redact: true
    field :expires_at, :utc_datetime
    field :last_seen_at, :utc_datetime
    field :revoked_at, :utc_datetime

    belongs_to :user, RockcutApi.Accounts.User
    # D54: the `device_token_id` column (D34's "Sign in as me") stays, unread,
    # for one release so a rolled-back image still works; dropped later.

    timestamps(type: :utc_datetime)
  end
end
