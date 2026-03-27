defmodule RockcutApi.Brewing.BrewhouseResolverTest do
  use RockcutApi.DataCase

  alias RockcutApi.Brewing
  alias RockcutApi.Brewing.BrewhouseResolver

  # ── Test data helpers ──────────────────────────────────────────────

  defp create_default_brewhouse do
    {:ok, brewhouse} =
      Brewing.create_brewhouse(%{name: "Production", is_default: true})

    brewhouse
  end

  defp create_non_default_brewhouse do
    {:ok, brewhouse} =
      Brewing.create_brewhouse(%{name: "Pilot System", is_default: false})

    brewhouse
  end

  defp create_brand(attrs) do
    {:ok, brand} =
      Brewing.create_brand(Map.merge(%{name: "Test IPA"}, attrs))

    brand
  end

  defp create_recipe(brand_id) do
    {:ok, recipe} =
      Brewing.create_recipe(%{
        brand_id: brand_id,
        batch_size: Decimal.new("10"),
        batch_size_unit: "bbls"
      })

    recipe
  end

  # ── Tests ──────────────────────────────────────────────────────────

  describe "resolve/1 with Brand struct" do
    test "brand with explicit brewhouse_id returns that brewhouse, is_inherited=false" do
      brewhouse = create_non_default_brewhouse()
      brand = create_brand(%{brewhouse_id: brewhouse.id})

      {resolved, is_inherited} = BrewhouseResolver.resolve(brand)

      assert resolved.id == brewhouse.id
      assert resolved.name == "Pilot System"
      assert is_inherited == false
    end

    test "brand with nil brewhouse_id falls back to default brewhouse, is_inherited=true" do
      default = create_default_brewhouse()
      brand = create_brand(%{brewhouse_id: nil})

      {resolved, is_inherited} = BrewhouseResolver.resolve(brand)

      assert resolved.id == default.id
      assert resolved.name == "Production"
      assert is_inherited == true
    end

    test "brand with nil brewhouse_id and no default brewhouse returns {nil, false}" do
      # No brewhouses at all
      brand = create_brand(%{brewhouse_id: nil})

      {resolved, is_inherited} = BrewhouseResolver.resolve(brand)

      assert resolved == nil
      assert is_inherited == false
    end
  end

  describe "resolve/1 with brand_id integer" do
    test "resolves by brand ID" do
      default = create_default_brewhouse()
      brand = create_brand(%{brewhouse_id: nil})

      {resolved, is_inherited} = BrewhouseResolver.resolve(brand.id)

      assert resolved.id == default.id
      assert is_inherited == true
    end

    test "resolves explicit brewhouse by brand ID" do
      brewhouse = create_non_default_brewhouse()
      brand = create_brand(%{brewhouse_id: brewhouse.id})

      {resolved, is_inherited} = BrewhouseResolver.resolve(brand.id)

      assert resolved.id == brewhouse.id
      assert is_inherited == false
    end
  end

  describe "resolve_for_recipe/1" do
    test "chains recipe -> brand -> brewhouse correctly" do
      default = create_default_brewhouse()
      brand = create_brand(%{brewhouse_id: nil})
      recipe = create_recipe(brand.id)

      {resolved, is_inherited} = BrewhouseResolver.resolve_for_recipe(recipe.id)

      assert resolved.id == default.id
      assert is_inherited == true
    end

    test "chains recipe -> brand -> explicit brewhouse correctly" do
      brewhouse = create_non_default_brewhouse()
      brand = create_brand(%{brewhouse_id: brewhouse.id})
      recipe = create_recipe(brand.id)

      {resolved, is_inherited} = BrewhouseResolver.resolve_for_recipe(recipe.id)

      assert resolved.id == brewhouse.id
      assert is_inherited == false
    end
  end
end
