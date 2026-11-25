defmodule RockcutApi.BrewerySettings do
  @moduledoc """
  D63 §6: the brewery's settings (Brewery → Settings), one row. Recipes read
  them from D68. Who may read or change them is `Authz`'s
  (`:brewery_settings`).
  """
  alias RockcutApi.Repo
  alias RockcutApi.Accounts.User
  alias RockcutApi.BrewerySettings.Settings

  @changed "Someone else changed the settings since you opened them. Their values are shown now; check yours, then save again."

  @doc "The settings with who last changed them; a missing row is made with the starting values."
  def get do
    (Repo.get(Settings, 1) || create()) |> Repo.preload(:updated_by)
  end

  # Two first reads at once: the second insert does nothing, and both read the one row.
  defp create do
    Repo.insert!(%Settings{id: 1}, on_conflict: :nothing, conflict_target: :id)
    Repo.get!(Settings, 1)
  end

  @doc """
  Change the given settings as `user`. `lock_version` is the one the form
  opened: missing is `{:error, {:invalid, _}}`, stale `{:error, {:stale,
  sentence, settings}}` with the values now. It's checked in the write's
  `BEGIN IMMEDIATE` transaction. Nothing different is no write: the version
  and "Last changed by" stay.
  """
  def update(attrs, %User{} = user) do
    with {:ok, version} <- version(attrs["lock_version"]) do
      Repo.transaction(fn -> write(get(), version, attrs, user) end, mode: :immediate)
    end
  end

  defp write(settings, version, attrs, user) do
    if settings.lock_version != version, do: Repo.rollback({:stale, @changed, settings})
    changeset = Settings.changeset(settings, attrs)

    cond do
      not changeset.valid? ->
        Repo.rollback(changeset)

      changeset.changes == %{} ->
        settings

      true ->
        changeset
        |> Ecto.Changeset.change(lock_version: version + 1, updated_by_id: user.id)
        |> Repo.update!()
        |> Repo.preload(:updated_by, force: true)
    end
  end

  defp version(v) when is_integer(v), do: {:ok, v}
  defp version(nil), do: {:error, {:invalid, %{lock_version: ["can't be blank"]}}}

  defp version(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, ""} -> {:ok, n}
      _ -> version(:bad)
    end
  end

  defp version(_), do: {:error, {:invalid, %{lock_version: ["is invalid"]}}}
end
