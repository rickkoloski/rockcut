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

  @doc """
  D59 §4.2: when `field` (a department id) changes to a department that isn't
  on the schedule (`scheduling: false`, e.g. Owners), add
  `{field, "<name> isn't on the schedule"}`. Positions, shifts and schedule
  events can't be in one. An unknown id is left to `validate_parents/2`.
  """
  def validate_scheduled_department(%Changeset{} = changeset, field \\ :department_id) do
    with {:ok, id} when not is_nil(id) <- Changeset.fetch_change(changeset, field),
         false <- Keyword.has_key?(changeset.errors, field),
         id when not is_nil(id) <- RockcutApi.Ids.parse(id),
         %{scheduling: false, name: name} <- Repo.get(RockcutApi.Accounts.Department, id) do
      Changeset.add_error(changeset, field, "#{name} isn't on the schedule",
        validation: :scheduled_department
      )
    else
      _ -> changeset
    end
  end

  @doc """
  D55 lead decisions 6 (gap 9): `attrs` with a blank string under `field`
  (atom or string key) replaced by nil. Ecto casts a blank string to the
  field's schema default (`sort_order` 0, the top), but `""` means "not set",
  like `null`.
  """
  def blank_to_nil(attrs, field) when is_map(attrs) and is_atom(field) do
    key = Atom.to_string(field)

    Map.new(attrs, fn
      {k, v} when (k == field or k == key) and is_binary(v) ->
        if String.trim(v) == "", do: {k, nil}, else: {k, v}

      kv ->
        kv
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
