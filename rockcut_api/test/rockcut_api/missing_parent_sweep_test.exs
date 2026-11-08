defmodule RockcutApi.MissingParentSweepTest do
  @moduledoc """
  D55 §2.12, T14: every `belongs_to` field that a changeset takes from input
  (it casts it), given a parent that doesn't exist (`12345`, `0`, `-1`), is
  an error `"does not exist"` on that field, so the write is a 422, not
  SQLite's unnamed foreign-key error (`Ecto.ConstraintError`, a 500).

  Built from the schemas: every module of the app with `__schema__/1`, every
  `*changeset*` function (arity 2: `(struct, attrs)`; arity 1: `(attrs)`), every
  `belongs_to`. A new `belongs_to` cast without `RockcutApi.Changeset.validate_parents/2`
  fails here. A field no changeset casts is set by the context from a row it
  already loaded, so input can't name a missing parent there.
  """
  # Not async: "a parent that exists" inserts a department, and SQLite's one
  # writer can be busy with another async test ("Database busy").
  use RockcutApi.DataCase, async: false

  @missing [12_345, 0, -1]

  defp schemas do
    {:ok, mods} = :application.get_key(:rockcut_api, :modules)

    for m <- mods,
        Code.ensure_loaded?(m),
        function_exported?(m, :__schema__, 1),
        m.__schema__(:source),
        do: m
  end

  defp parent_fields(schema) do
    for name <- schema.__schema__(:associations),
        %Ecto.Association.BelongsTo{owner_key: key} <- [schema.__schema__(:association, name)],
        do: key
  end

  defp changesets(schema) do
    for {fun, arity} <- schema.__info__(:functions),
        arity in [1, 2],
        fun != :__changeset__,
        String.contains?(Atom.to_string(fun), "changeset"),
        do: {fun, arity}
  end

  # The data a changeset is written for, where the default struct isn't it.
  @data %{
    {RockcutApi.Accounts.User, :device_update_changeset} => %{
      kind: "device",
      is_owner: false,
      schedulable: false,
      must_reset_password: false
    }
  }

  defp run(schema, {fun, 2}, attrs),
    do: apply(schema, fun, [struct(schema, Map.get(@data, {schema, fun}, %{})), attrs])

  defp run(schema, {fun, 1}, attrs), do: apply(schema, fun, [attrs])

  # {schema, changeset, field} for every parent id a changeset casts. A
  # changeset that can't take these attrs at all (a FunctionClauseError on
  # its own arguments) doesn't cast from input in this shape.
  defp writable do
    for schema <- schemas(),
        field <- parent_fields(schema),
        cs <- changesets(schema),
        casts?(schema, cs, field),
        do: {schema, cs, field}
  end

  defp casts?(schema, cs, field) do
    match?(%Ecto.Changeset{changes: %{^field => _}}, run(schema, cs, %{field => 12_345}))
  rescue
    FunctionClauseError -> false
  end

  test "the sweep finds the parent ids input can write (not empty by mistake)" do
    assert length(writable()) >= 40
  end

  test "T14: a missing parent is \"does not exist\" on that field, for every writable belongs_to" do
    failures =
      for {schema, {fun, arity}, field} <- writable(),
          value <- @missing,
          cs = run(schema, {fun, arity}, %{field => value}),
          not Enum.any?(Keyword.get_values(cs.errors, field), &match?({"does not exist", _}, &1)),
          do: "#{inspect(schema)}.#{fun}/#{arity} #{field}=#{value}"

    assert failures == [],
           "No \"does not exist\" error (the write would 500 on SQLite):\n" <>
             Enum.join(failures, "\n")
  end

  # Lead decisions 6, gap 11: the wrong type is an error on the field (the
  # cast's "is invalid"), never a raise, and validate_parents leaves it be.
  test "a wrong-typed parent is an error on that field, for every writable belongs_to" do
    failures =
      for {schema, {fun, arity}, field} <- writable(),
          value <- ["abc", "12abc", 1.5, true, [], %{}],
          cs = run(schema, {fun, arity}, %{field => value}),
          not Keyword.has_key?(cs.errors, field),
          do: "#{inspect(schema)}.#{fun}/#{arity} #{field}=#{inspect(value)}"

    assert failures == [], "No error on the field:\n" <> Enum.join(failures, "\n")
  end

  test "a parent that exists passes" do
    dept = RockcutApi.AccountsFixtures.department_fixture("bar")

    cs =
      RockcutApi.Scheduling.Position.changeset(%RockcutApi.Scheduling.Position{}, %{
        department_id: dept.id
      })

    refute Keyword.has_key?(cs.errors, :department_id)
  end
end
