defmodule RockcutApi.Ids do
  @moduledoc """
  Reading a row id from params (a URL segment, a query or a JSON body): a
  positive integer, or a string of digits, no bigger than SQLite's largest
  integer. Anything else is nil, and the caller answers 404 or 422. A
  bigger number can't be a row, and the database driver refuses it, which
  was a 500 (D53 Part 2 DEV QA, fix cycle 1 gap 7). Used by the Boards and
  the task boards.
  """

  @max 9_223_372_036_854_775_807

  @doc "The id, or nil."
  def parse(id) when is_integer(id) and id > 0 and id <= @max, do: id

  def parse(s) when is_binary(s) do
    case Integer.parse(s) do
      {id, ""} -> parse(id)
      _ -> nil
    end
  end

  def parse(_), do: nil

  # A History page past this is empty anyway; its offset must still fit.
  @max_page 1_000_000

  @doc "A page number from params: 1 for junk, at most #{@max_page}."
  def page(value), do: value |> parse() |> Kernel.||(1) |> min(@max_page)
end
