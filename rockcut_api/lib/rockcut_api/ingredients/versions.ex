defmodule RockcutApi.Ingredients.Versions do
  @moduledoc """
  D61 lead decisions 2 (gaps 1, 2): orders and contracts are saved whole,
  so a dialog opened before someone else's save would put the old values
  back. Each carries `lock_version`; the Edit dialog sends back the one it
  opened, and a save from another version is refused (409) inside the
  write's transaction, so nothing is written. Every write bumps it (an
  order's cancel and receive too).
  """
  alias RockcutApi.Repo

  @doc "The version the dialog opened (`lock_version`, an integer); missing or not a whole number → 422."
  def given!(attrs) do
    case attrs["lock_version"] do
      v when is_integer(v) ->
        v

      v when is_binary(v) ->
        case Integer.parse(v) do
          {n, ""} -> n
          _ -> Repo.rollback({:invalid, %{lock_version: ["is invalid"]}})
        end

      nil ->
        Repo.rollback({:invalid, %{lock_version: ["can't be blank"]}})

      _ ->
        Repo.rollback({:invalid, %{lock_version: ["is invalid"]}})
    end
  end

  @doc "Refuse (409) when `record` (read in the transaction) isn't at `version`; `what` is \"order\", \"contract\", \"product\" or \"count\"."
  def check!(record, version, what) do
    if record.lock_version != version do
      Repo.rollback(
        {:conflict,
         "Someone else changed this #{what} since you opened it. Close and reopen it to see their change."}
      )
    end

    record
  end

  @doc "The next version, on a changeset (forced, so a write with nothing else changed still bumps it)."
  def bump(%Ecto.Changeset{} = changeset) do
    Ecto.Changeset.force_change(
      changeset,
      :lock_version,
      Ecto.Changeset.get_field(changeset, :lock_version) + 1
    )
  end
end
