defmodule RockcutApi.IdsTest do
  @moduledoc "D53's `RockcutApi.Ids`, with D55 §2.11's `filter/1` and `page/1` changes."
  use ExUnit.Case, async: true

  alias RockcutApi.Ids

  @max 9_223_372_036_854_775_807
  @max_page 1_000_000

  test "parse: positive ids within SQLite's range" do
    assert Ids.parse(1) == 1
    assert Ids.parse("42") == 42
    assert Ids.parse(@max) == @max

    for junk <- [0, -1, @max + 1, "99999999999999999999", "abc", "1e20", "", nil, 1.0e20, "4 2"],
        do: assert(Ids.parse(junk) == nil, inspect(junk))
  end

  test "filter: absent or empty is no filter; a usable id filters; anything else is :error" do
    assert Ids.filter(nil) == {:ok, nil}
    assert Ids.filter("") == {:ok, nil}
    assert Ids.filter("7") == {:ok, 7}

    for junk <- ["1e20", "abc", "-1", "0", "99999999999999999999"],
        do: assert(Ids.filter(junk) == :error, junk)
  end

  test "page: digits past the range (or past the cap) are the last page, so it's empty" do
    assert Ids.page("99999999999999999999") == @max_page
    assert Ids.page("#{@max_page + 1}") == @max_page
    assert Ids.page(@max_page * 10) == @max_page
    assert Ids.page("3") == 3
    assert Ids.page(2) == 2
  end

  test "page: junk is page 1" do
    for junk <- ["abc", "-1", "0", "", nil, -5, 0, "1e3", 2.5],
        do: assert(Ids.page(junk) == 1, inspect(junk))
  end
end
