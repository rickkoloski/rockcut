defmodule RockcutApi.Yeast.RulesTest do
  @moduledoc """
  D64 §5.3 table by table: one row per line of "From the batch's pitches"
  (`from_sources/1`) and "Harvesting on top" (`combine/2`), plus the fold
  and a refold after an entry is removed. US-05 = 1, WLP002 = 2, WLP001 = 3.
  """
  use ExUnit.Case, async: true

  alias RockcutApi.Yeast.Rules

  @us05 1
  @wlp002 2
  @wlp001 3

  defp s(ids, gen), do: %{product_ids: ids, generation: gen}

  defp r(ids, gen),
    do: %{product_ids: Enum.sort(ids), generation: gen, coferment: length(ids) > 1}

  # {table line, sources, result}
  @from_sources [
    {"Lab yeast (Mother) of one strain → that strain, gen 1", [{[@us05], 0}], {[@us05], 1}},
    {"Mother, two lots of the same strain → gen 1", [{[@us05], 0}, {[@us05], 0}], {[@us05], 1}},
    {"One harvest of strain S, gen n → S, gen n + 1", [{[@us05], 2}], {[@us05], 3}},
    {"Several sources, one strain, gens a, b → max(a, b) + 1", [{[@us05], 2}, {[@us05], 4}],
     {[@us05], 5}},
    {"Several sources, one strain, Mother counts as 0", [{[@us05], 0}, {[@us05], 2}],
     {[@us05], 3}},
    {"Sources with two or more strains → co-ferment of all, gen 1",
     [{[@us05], 0}, {[@wlp001], 2}], {[@us05, @wlp001], 1}},
    {"A co-ferment harvest, gen n, alone → the same co-ferment, gen n + 1",
     [{[@us05, @wlp002], 1}], {[@us05, @wlp002], 2}},
    {"A co-ferment plus another strain not in it → a new co-ferment (all strains), gen 1",
     [{[@us05, @wlp002], 3}, {[@wlp001], 0}], {[@us05, @wlp002, @wlp001], 1}}
  ]

  for {line, sources, {ids, gen}} <- @from_sources do
    test "from_sources: #{line}" do
      sources = for {ids, g} <- unquote(Macro.escape(sources)), do: s(ids, g)
      assert Rules.from_sources(sources) == r(unquote(ids), unquote(gen))
    end
  end

  test "from_sources: nothing pitched → nil (the dialog asks, A5)" do
    assert Rules.from_sources([]) == nil
  end

  # {table line, brink holds, harvest brings, result}
  @on_top [
    {"strain S, gen n + S, gen n (any batch) → weight up; still gen n", {[@us05], 2},
     {[@us05], 2}, {[@us05], 2}},
    {"S, gen n + S, gen m ≠ n → gen max(n, m)", {[@us05], 2}, {[@us05], 4}, {[@us05], 4}},
    {"S, gen n + S, gen m < n → gen n stays", {[@us05], 4}, {[@us05], 2}, {[@us05], 4}},
    {"strains A + strains B ≠ A → co-ferment of A ∪ B, gen 1", {[@us05], 4}, {[@wlp002], 1},
     {[@us05, @wlp002], 1}},
    {"a co-ferment + one of its own strains → a different set: co-ferment of the union, gen 1",
     {[@us05, @wlp002], 3}, {[@us05], 5}, {[@us05, @wlp002], 1}}
  ]

  for {line, held, incoming, {ids, gen}} <- @on_top do
    test "combine: #{line}" do
      {hi, hg} = unquote(Macro.escape(held))
      {ii, ig} = unquote(Macro.escape(incoming))
      assert Rules.combine(s(hi, hg), s(ii, ig)) == r(unquote(ids), unquote(gen))
    end
  end

  test "combine into an empty brink takes what the harvest brings" do
    assert Rules.combine(nil, s([@wlp002, @us05], 1)) == r([@us05, @wlp002], 1)
  end

  defp entry(id, kind, ids \\ nil, gen \\ nil),
    do: %{id: id, kind: kind, product_ids: ids, generation: gen}

  test "fold: harvested entries in id order; pitches and adjustments don't change it" do
    entries = [
      entry(4, "harvested", [@us05], 4),
      entry(1, "harvested", [@us05], 2),
      entry(2, "pitched", [@us05], 2),
      entry(3, "adjusted")
    ]

    assert Rules.fold(entries) == r([@us05], 4)
    assert Rules.fold([entry(1, "pitched", [@us05], 2)]) == nil
  end

  test "refold after removing an entry: the co-ferment goes back to what it was" do
    first = entry(1, "harvested", [@us05], 2)
    second = entry(2, "harvested", [@us05], 4)
    third = entry(3, "harvested", [@wlp002], 1)

    assert Rules.fold([first, second, third]) == r([@us05, @wlp002], 1)
    assert Rules.fold([first, second]) == r([@us05], 4)
    assert Rules.fold([first]) == r([@us05], 2)
    assert Rules.fold([]) == nil
  end
end
