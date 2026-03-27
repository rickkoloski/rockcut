defmodule RockcutApi.Brewing.BrewhouseResolver do
  @moduledoc """
  Resolves the effective brewhouse for a brand.
  If brand has an explicit brewhouse_id, use that.
  If nil, fall back to the default brewhouse (is_default=true).
  """

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Brand, Brewhouse}
  import Ecto.Query

  @doc """
  Returns {brewhouse, is_inherited} tuple.
  is_inherited is true when the brand had no explicit brewhouse and we fell back to default.
  """
  def resolve(brand_or_id)

  def resolve(%Brand{brewhouse_id: nil}) do
    case get_default_brewhouse() do
      nil -> {nil, false}
      brewhouse -> {brewhouse, true}
    end
  end

  def resolve(%Brand{brewhouse_id: id}) when not is_nil(id) do
    {Repo.get!(Brewhouse, id), false}
  end

  def resolve(brand_id) when is_integer(brand_id) do
    brand = Repo.get!(Brand, brand_id)
    resolve(brand)
  end

  @doc "Resolve from a recipe_id by going recipe -> brand -> brewhouse"
  def resolve_for_recipe(recipe_id) do
    recipe = Repo.get!(RockcutApi.Brewing.Recipe, recipe_id)
    resolve(recipe.brand_id)
  end

  defp get_default_brewhouse do
    Brewhouse
    |> where(is_default: true)
    |> limit(1)
    |> Repo.one()
  end
end
