defmodule RockcutApi.Production.FlagSignoff do
  @moduledoc """
  D47 §3.9: "Mark OK" on a flag. One per flag (`flag_key`); signing again
  replaces it. It holds while `signature` matches the flag's.
  """
  use Ecto.Schema
  import Ecto.Changeset

  schema "flag_signoffs" do
    field :flag_key, :string
    field :signature, :string
    field :note, :string
    field :signed_at, :utc_datetime

    belongs_to :user, RockcutApi.Accounts.User

    timestamps(type: :utc_datetime)
  end

  def changeset(signoff, attrs) do
    signoff
    |> cast(attrs, [:flag_key, :signature, :note])
    |> update_change(:note, fn n -> n && String.trim(n) end)
    |> validate_required([:flag_key, :signature])
    |> validate_length(:flag_key, max: 255)
    |> validate_length(:signature, max: 64)
    |> validate_length(:note, max: 500)
  end
end
