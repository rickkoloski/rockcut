defmodule RockcutApi.Formulas.Functions.BrewingCalcs do
  @moduledoc """
  Brewing calculation formula functions (IBU, OG).
  """

  import Ecto.Query

  alias RockcutApi.Brewing.{Recipe, RecipeIngredient, IngredientLot, Ingredient, IngredientCategory}

  @default_efficiency 0.72
  @gallons_per_bbl 31.0

  @doc """
  Estimated IBU for a recipe using the Tinseth formula.

  Tinseth IBU per addition = (mg/L alpha acid) * utilization
  where utilization depends on boil time and wort gravity.
  """
  def est_ibu(context, params) do
    recipe_id = params["recipe_id"] || params[:recipe_id]
    repo = context.repo

    recipe = repo.get!(Recipe, recipe_id)
    batch_volume_gallons = batch_volume_gallons(recipe)

    hop_additions = load_hop_additions(repo, recipe_id)

    total_ibu =
      hop_additions
      |> Enum.map(fn ri -> ibu_contribution(ri, batch_volume_gallons) end)
      |> Enum.sum()

    {:ok, %{value: Float.round(total_ibu + 0.0, 1)}}
  end

  @doc """
  Estimated original gravity from grain bill.

  gravity points = sum of (weight_lbs * potential_gravity_points * efficiency) / volume
  OG = 1.000 + (total_points / 1000)
  """
  def est_og(context, params) do
    recipe_id = params["recipe_id"] || params[:recipe_id]
    repo = context.repo

    recipe = repo.get!(Recipe, recipe_id)
    batch_volume_gallons = batch_volume_gallons(recipe)
    efficiency = decimal_to_float(recipe.efficiency_target) || @default_efficiency

    grain_additions = load_grain_additions(repo, recipe_id)

    total_points =
      grain_additions
      |> Enum.map(fn ri -> gravity_points(ri, efficiency) end)
      |> Enum.sum()

    og =
      if batch_volume_gallons > 0 do
        1.0 + total_points / batch_volume_gallons / 1000.0
      else
        1.0
      end

    {:ok, %{value: Float.round(og, 4)}}
  end

  # -- Private helpers --

  defp load_hop_additions(repo, recipe_id) do
    hop_category_id = get_category_id(repo, "Hop")

    RecipeIngredient
    |> where(recipe_id: ^recipe_id)
    |> join(:inner, [ri], lot in IngredientLot, on: ri.lot_id == lot.id)
    |> join(:inner, [ri, lot], ing in Ingredient, on: lot.ingredient_id == ing.id)
    |> where([ri, lot, ing], ing.category_id == ^hop_category_id)
    |> select([ri, lot, _ing], %{
      amount: ri.amount,
      unit: ri.unit,
      time_minutes: ri.time_minutes,
      alpha_acid: lot.alpha_acid
    })
    |> repo.all()
  end

  defp load_grain_additions(repo, recipe_id) do
    grain_category_ids = get_fermentable_category_ids(repo)

    RecipeIngredient
    |> where(recipe_id: ^recipe_id)
    |> join(:inner, [ri], lot in IngredientLot, on: ri.lot_id == lot.id)
    |> join(:inner, [ri, lot], ing in Ingredient, on: lot.ingredient_id == ing.id)
    |> where([ri, lot, ing], ing.category_id in ^grain_category_ids)
    |> select([ri, lot, _ing], %{
      amount: ri.amount,
      unit: ri.unit,
      potential_gravity: lot.potential_gravity
    })
    |> repo.all()
  end

  defp get_category_id(repo, name) do
    IngredientCategory
    |> where(name: ^name)
    |> select([c], c.id)
    |> repo.one!()
  end

  defp get_fermentable_category_ids(repo) do
    IngredientCategory
    |> where([c], c.name in ["Grain", "Extract", "Sugar"])
    |> select([c], c.id)
    |> repo.all()
  end

  defp ibu_contribution(addition, batch_volume_gallons) do
    alpha_acid = decimal_to_float(addition.alpha_acid) || 0.0
    weight_oz = to_ounces(addition.amount, addition.unit)
    boil_time = addition.time_minutes || 0

    if alpha_acid > 0 and weight_oz > 0 and boil_time > 0 and batch_volume_gallons > 0 do
      # Tinseth utilization (simplified — assumes ~1.050 average gravity)
      bigness = 1.65 * :math.pow(0.000125, 1.050 - 1.0)
      boil_factor = (1.0 - :math.exp(-0.04 * boil_time)) / 4.15
      utilization = bigness * boil_factor

      # mg/L alpha acid
      mg_per_l = (alpha_acid / 100.0) * (weight_oz * 28.3495) * 1000.0 / (batch_volume_gallons * 3.78541)

      mg_per_l * utilization
    else
      0.0
    end
  end

  defp gravity_points(addition, efficiency) do
    potential = decimal_to_float(addition.potential_gravity) || 0.0
    weight_lbs = to_pounds(addition.amount, addition.unit)

    if potential > 1.0 and weight_lbs > 0 do
      # potential_gravity is stored as 1.037 format
      # points = (potential - 1.0) * 1000
      points_per_lb = (potential - 1.0) * 1000.0
      weight_lbs * points_per_lb * efficiency
    else
      0.0
    end
  end

  defp batch_volume_gallons(recipe) do
    size = decimal_to_float(recipe.batch_size) || 0.0

    case recipe.batch_size_unit do
      "bbls" -> size * @gallons_per_bbl
      "gallons" -> size
      "liters" -> size * 0.264172
      _ -> size
    end
  end

  defp to_ounces(amount, unit) do
    val = decimal_to_float(amount) || 0.0

    case unit do
      "oz" -> val
      "lb" -> val * 16.0
      "g" -> val / 28.3495
      "kg" -> val * 1000.0 / 28.3495
      _ -> val
    end
  end

  defp to_pounds(amount, unit) do
    val = decimal_to_float(amount) || 0.0

    case unit do
      "lb" -> val
      "oz" -> val / 16.0
      "g" -> val / 453.592
      "kg" -> val * 2.20462
      _ -> val
    end
  end

  defp decimal_to_float(nil), do: nil
  defp decimal_to_float(%Decimal{} = d), do: Decimal.to_float(d)
  defp decimal_to_float(f) when is_float(f), do: f
  defp decimal_to_float(i) when is_integer(i), do: i * 1.0
end
