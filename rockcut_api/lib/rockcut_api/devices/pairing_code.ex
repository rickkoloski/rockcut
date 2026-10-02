defmodule RockcutApi.Devices.PairingCode do
  @moduledoc "A single-use, 10-minute pairing code for a device account (D33). Stored hashed."
  use Ecto.Schema

  schema "device_pairing_codes" do
    field :code_hash, :binary, redact: true
    field :expires_at, :utc_datetime
    field :used_at, :utc_datetime

    belongs_to :user, RockcutApi.Accounts.User
    belongs_to :created_by, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end
end
