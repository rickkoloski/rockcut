defmodule RockcutApi.Formulas.BrewingCalcsParityTest do
  @moduledoc """
  D60 §3.4: `est_og` and `est_ibu` read the lot's feature values instead of
  the dropped columns and give the same numbers. The expected values were
  produced by the pre-D60 code (lot columns) from the same fixture. One grain
  is on a child of Grains, as every grain is after D60's seed.
  """
  use RockcutApi.DataCase

  import RockcutApi.IngredientFixtures

  alias RockcutApi.Brewing
  alias RockcutApi.Brewing.IngredientCategory
  alias RockcutApi.Formulas.FormulaRuntime

  @context %{repo: RockcutApi.Repo}

  setup do
    {:ok, hops} = Brewing.create_ingredient_category(%{name: "Hops"})
    {:ok, grains} = Brewing.create_ingredient_category(%{name: "Grains"})
    crystal = Repo.insert!(%IngredientCategory{name: "Crystal/Caramel", parent_id: grains.id})

    lot = fn category, name, features ->
      {:ok, ing} = Brewing.create_ingredient(%{name: name, category_id: category.id})
      {:ok, lot} = Brewing.create_ingredient_lot(%{ingredient_id: ing.id})
      lot_features!(lot, features)
    end

    %{
      lots: [
        {lot.(hops, "Cascade", alpha_acid_pct: "5.5"), "2.0", "oz", 60},
        {lot.(hops, "Citra", alpha_acid_pct: "12.3"), "1.5", "lb", 15},
        {lot.(grains, "Pale", extract_fgdb: "80.0"), "10.0", "lb", nil},
        {lot.(crystal, "Crystal", extract_fgdb: "77.9"), "2", "kg", nil}
      ]
    }
  end

  defp recipe(lots, attrs) do
    {:ok, brand} = Brewing.create_brand(%{name: "Parity #{System.unique_integer([:positive])}"})
    {:ok, recipe} = Brewing.create_recipe(Map.merge(%{brand_id: brand.id, boil_time: 60}, attrs))

    for {lot, amount, unit, time} <- lots do
      {:ok, _} =
        Brewing.create_recipe_ingredient(%{
          recipe_id: recipe.id,
          lot_id: lot.id,
          amount: amount,
          unit: unit,
          use: "boil",
          time_minutes: time
        })
    end

    recipe
  end

  defp run(name, recipe) do
    {:ok, %{value: value}} = FormulaRuntime.execute(name, %{"recipe_id" => recipe.id}, @context)
    value
  end

  test "5 gallons at the default efficiency", %{lots: lots} do
    r = recipe(lots, %{batch_size: "5.0", batch_size_unit: "gallons"})
    assert run("est_og", r) == 1.0757
    assert run("est_ibu", r) == 544.1
  end

  test "15 bbls with an efficiency target", %{lots: lots} do
    r = recipe(lots, %{batch_size: "15", batch_size_unit: "bbls", efficiency_target: "68"})
    assert run("est_og", r) == 1.0769
    assert run("est_ibu", r) == 5.9
  end

  test "a lot with no extract or alpha acid adds nothing", %{lots: lots} do
    hops = Repo.get_by!(IngredientCategory, name: "Hops")
    {:ok, ing} = Brewing.create_ingredient(%{name: "Bare", category_id: hops.id})
    {:ok, bare} = Brewing.create_ingredient_lot(%{ingredient_id: ing.id})

    r = recipe(lots ++ [{bare, "4", "oz", 60}], %{batch_size: "5.0", batch_size_unit: "gallons"})
    assert run("est_og", r) == 1.0757
    assert run("est_ibu", r) == 544.1
  end
end
