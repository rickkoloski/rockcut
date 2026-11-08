defmodule RockcutApi.Changeset do
  @moduledoc """
  Changeset helpers shared across contexts.

  D55 §2.12: `validate_parents/2`. SQLite's foreign-key error doesn't name the
  constraint ("FOREIGN KEY constraint failed"), so Ecto can't match it to a
  `foreign_key_constraint/3` and raises `Ecto.ConstraintError`, a 500. So a
  changeset looks the parent up itself before the write. The
  `foreign_key_constraint` calls stay (they'd work on another database).
  """
  import Ecto.Query, only: [from: 2]

  alias Ecto.Association.BelongsTo
  alias Ecto.Changeset
  alias RockcutApi.Repo

  @doc """
  For each `belongs_to` field in `fields` that changed to a non-nil value, add
  `{field, "does not exist"}` unless the parent row exists. An id that can't
  be a row (0, negative, past SQLite's range) doesn't exist either. A field
  that already has an error (a cast error, say) is left alone.
  """
  def validate_parents(%Changeset{} = changeset, fields) when is_list(fields) do
    Enum.reduce(fields, changeset, fn field, cs ->
      case Changeset.fetch_change(cs, field) do
        {:ok, value} when not is_nil(value) ->
          if Keyword.has_key?(cs.errors, field) or parent_exists?(cs, field, value),
            do: cs,
            else: Changeset.add_error(cs, field, "does not exist", validation: :parent)

        _ ->
          cs
      end
    end)
  end

  defp parent_exists?(%Changeset{data: %schema{}}, field, value) do
    %BelongsTo{related: related, related_key: key} = parent(schema, field)

    case RockcutApi.Ids.parse(value) do
      nil -> false
      id -> Repo.exists?(from(r in related, where: field(r, ^key) == ^id))
    end
  end

  defp parent(schema, field) do
    Enum.find_value(schema.__schema__(:associations), fn name ->
      case schema.__schema__(:association, name) do
        %BelongsTo{owner_key: ^field} = assoc -> assoc
        _ -> nil
      end
    end) || raise ArgumentError, "#{inspect(schema)}.#{field} is not a belongs_to field"
  end
end
