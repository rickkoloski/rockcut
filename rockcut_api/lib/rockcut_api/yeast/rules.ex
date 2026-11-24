defmodule RockcutApi.Yeast.Rules do
  @moduledoc """
  D64 §5.3, pure: a strain set and generation (`%{product_ids, generation}`;
  a strain is a yeast product, A2; two or more products make a co-ferment).

    * `from_sources/1`: what a batch's pitches give its harvest. Lab yeast
      (the Mother) is generation 0. Sources that all carry the same strain
      set give that set at the highest generation + 1 (one strain from the
      Mother is gen 1; a co-ferment alone is the same co-ferment, gen n + 1);
      sources with different sets give a new co-ferment of all their strains,
      gen 1.
    * `combine/2`: a harvest on top of what a brink holds. The same set
      keeps it at the higher generation (the same generation unchanged); a
      different set makes a co-ferment of both, gen 1.
    * `fold/1`: a record's state, its `harvested` entries in id order
      through `combine/2`, so removing one (an un-check, Stop 3) refolds.
  """

  @type state :: %{
          product_ids: [pos_integer()],
          generation: non_neg_integer(),
          coferment: boolean()
        }

  @doc "The state a set of sources gives a harvest; nil with no sources."
  def from_sources([]), do: nil

  def from_sources(sources) when is_list(sources) do
    sets = sources |> Enum.map(&set(&1.product_ids)) |> Enum.uniq()

    case sets do
      [only] -> state(only, (sources |> Enum.map(& &1.generation) |> Enum.max()) + 1)
      _ -> state(sets |> Enum.concat() |> set(), 1)
    end
  end

  @doc "What a brink holds after `incoming` goes in on top of `held` (nil: an empty brink)."
  def combine(nil, incoming), do: state(set(incoming.product_ids), incoming.generation)

  def combine(held, incoming) do
    held_set = set(held.product_ids)
    in_set = set(incoming.product_ids)

    if held_set == in_set,
      do: state(held_set, max(held.generation, incoming.generation)),
      else: state(set(held_set ++ in_set), 1)
  end

  @doc """
  A record's state from its entries (any kinds, any order): the `harvested`
  ones in id order through `combine/2`; nil when it has none.
  """
  def fold(entries) do
    entries
    |> Enum.filter(&match?(%{kind: "harvested"}, &1))
    |> Enum.sort_by(& &1.id)
    |> Enum.reduce(nil, fn e, held ->
      combine(held, %{product_ids: e.product_ids, generation: e.generation})
    end)
  end

  defp set(ids), do: ids |> Enum.uniq() |> Enum.sort()

  defp state(ids, generation),
    do: %{product_ids: ids, generation: generation, coferment: length(ids) > 1}
end
