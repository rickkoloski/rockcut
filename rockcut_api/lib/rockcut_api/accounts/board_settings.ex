defmodule RockcutApi.Accounts.BoardSettings do
  @moduledoc """
  D58 §3.1: a task board's settings, per account (`users.board_settings`):
  `%{board_key => %{setting => value}}`, where `board_key` is a department's
  key or `"all"` (All departments). Only the settings someone changed are
  stored; `with_defaults/1` fills the rest.

  The set is closed: an unknown setting or value is a field error and nothing
  is saved.

    * `span` — 7 or 14 days;
    * `hide_completed`, `hide_shifts` — booleans;
    * `first_day` — "today", "sunday" or "monday";
    * `view` — "all", "mine" or "unassigned" ("mine" isn't on All departments);
    * `phone_view` — "vertical" (every day stacked) or "day" (one at a time).

  Who may save a board's settings is `Authz`'s (`{:board_settings, board}`).
  """
  import Ecto.Changeset

  @types %{
    span: :integer,
    hide_completed: :boolean,
    hide_shifts: :boolean,
    first_day: :string,
    view: :string,
    phone_view: :string
  }

  @defaults %{
    "span" => 14,
    "hide_completed" => false,
    "hide_shifts" => false,
    "first_day" => "today",
    "view" => "all",
    "phone_view" => "vertical"
  }

  @fields Map.keys(@types)
  @names Enum.map(@fields, &Atom.to_string/1)

  @doc "The settings a board has before anyone changes them."
  def defaults, do: @defaults

  @doc "A board's stored settings with the defaults filled in."
  def with_defaults(stored) when is_map(stored), do: Map.merge(@defaults, stored)

  @doc """
  Validate the settings in `attrs` (string keys, as JSON sends them) for
  `board_key`. `{:ok, map}` holds only the given settings, string-keyed;
  otherwise `{:error, changeset}` with an error per bad field.
  """
  def validate(board_key, attrs) when is_map(attrs) do
    unknown = Map.keys(attrs) -- @names

    changeset =
      {%{}, @types}
      |> cast(attrs, @fields, empty_values: [])
      |> validate_given(Map.keys(attrs) -- unknown)
      |> validate_inclusion(:span, [7, 14])
      |> validate_inclusion(:first_day, ~w(today sunday monday))
      |> validate_inclusion(:view, views(board_key))
      |> validate_inclusion(:phone_view, ~w(vertical day))
      |> unknown_errors(unknown)

    if changeset.valid? do
      {:ok, Map.new(changeset.changes, fn {k, v} -> {Atom.to_string(k), v} end)}
    else
      {:error, changeset}
    end
  end

  defp views("all"), do: ~w(all unassigned)
  defp views(_board), do: ~w(all mine unassigned)

  # A setting sent as null is refused, not stored.
  defp validate_given(changeset, names) do
    validate_required(changeset, Enum.map(names, &String.to_existing_atom/1))
  end

  defp unknown_errors(changeset, unknown) do
    Enum.reduce(unknown, changeset, fn name, cs ->
      %{cs | errors: [{name, {"is not a board setting", []}} | cs.errors], valid?: false}
    end)
  end
end
