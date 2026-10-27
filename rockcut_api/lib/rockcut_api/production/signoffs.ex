defmodule RockcutApi.Production.Signoffs do
  @moduledoc "D47 §3.9: signing a flag off (Mark OK) and removing a sign-off."
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.Production.FlagSignoff

  def list, do: Repo.all(from(s in FlagSignoff, preload: :user))

  def get_by_key(key), do: Repo.get_by(FlagSignoff, flag_key: key)

  @doc """
  Sign off `key` at `signature` as `user`, with an optional `note` (≤ 500);
  replaces any earlier one. D49: a muted flag (a pencilled batch's) can't be
  (`:flag_muted`).
  """
  def sign_off(attrs, %User{} = user) do
    attrs = Map.new(attrs, fn {k, v} -> {to_string(k), v} end)

    if muted?(attrs["key"]), do: {:error, :flag_muted}, else: put(attrs, user)
  end

  # Whether `key` is a muted flag now: the flags are worked out over every
  # batch still going, whatever the range.
  defp muted?(key) when is_binary(key) do
    today = RockcutApi.Tasks.today()
    {:ok, s} = RockcutApi.Production.Schedule.load(today, Date.add(today, 6), today)
    Enum.any?(s.flags, &(&1.key == key and &1.muted))
  end

  defp muted?(_), do: false

  defp put(attrs, user) do
    existing = attrs["key"] && get_by_key(attrs["key"])

    (existing || %FlagSignoff{})
    |> FlagSignoff.changeset(%{
      "flag_key" => attrs["key"],
      "signature" => attrs["signature"],
      "note" => attrs["note"]
    })
    |> Ecto.Changeset.put_change(:user_id, user.id)
    |> Ecto.Changeset.put_change(:signed_at, DateTime.utc_now() |> DateTime.truncate(:second))
    |> Repo.insert_or_update()
  end

  def remove(%FlagSignoff{} = s), do: Repo.delete(s)
end
