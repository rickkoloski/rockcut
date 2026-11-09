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

  @doc """
  An optional id filter from a query (D55 §2.11, History `task_id` and
  `card_id`): absent or empty is `{:ok, nil}` (no filter), a usable id
  `{:ok, id}`, anything else `:error`, so a bad link is a 422, not the
  whole History.
  """
  def filter(value) when value in [nil, ""], do: {:ok, nil}

  def filter(value) do
    case parse(value) do
      nil -> :error
      id -> {:ok, id}
    end
  end

  # A History page past this is empty anyway; its offset must still fit.
  @max_page 1_000_000

  @doc """
  A page number from params: 1 for junk (`abc`, `-1`, `0`, empty), at most
  #{@max_page}. A string of digits past SQLite's range is #{@max_page} too
  (D55 §2.11): a huge page is an empty page, not page 1.
  """
  def page(value) when is_integer(value) and value > 0, do: min(value, @max_page)

  def page(value) when is_binary(value) do
    case Integer.parse(value) do
      {n, ""} when n > 0 -> min(n, @max_page)
      _ -> 1
    end
  end

  def page(_), do: 1
end
