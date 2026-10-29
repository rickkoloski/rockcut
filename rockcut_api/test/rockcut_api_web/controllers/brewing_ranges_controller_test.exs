defmodule RockcutApiWeb.BrewingRangesControllerTest do
  # D51 (QA G1/G5) through the API: the body is raw JSON, so a number arrives
  # the way the UI sends it (a JSON number, which Jason decodes to a float).
  # Per resource: an in-range value saves; a 40-digit number is a 422 that
  # names the range and saves nothing.
  use RockcutApiWeb.ConnCase

  alias RockcutApi.{Brewing, Repo}

  @forty_digits "1234567890123456789012345678901234567890.5"

  setup %{conn: conn} do
    owner = RockcutApi.AccountsFixtures.owner_fixture()
    conn = put_req_header(conn, "authorization", "Bearer #{session_token_fixture(owner)}")

    {:ok, brand} = Brewing.create_brand(%{name: "[TEST] Ranges Pale"})
    {:ok, recipe} = Brewing.create_recipe(%{brand_id: brand.id, batch_size: 15})
    # Recipes are unique per brand and version: the recipe case uses its own brand.
    {:ok, recipe_brand} = Brewing.create_brand(%{name: "[TEST] Ranges Amber"})
    {:ok, batch} = Brewing.create_batch(%{brand_id: brand.id})
    {:ok, cat} = Brewing.create_ingredient_category(%{name: "Hops"})
    {:ok, hop} = Brewing.create_ingredient(%{name: "Cascade", category_id: cat.id})
    {:ok, lot} = Brewing.create_ingredient_lot(%{ingredient_id: hop.id, lot_number: "R-1"})

    %{
      conn: conn,
      brand: brand,
      recipe_brand: recipe_brand,
      recipe: recipe,
      batch: batch,
      hop: hop,
      lot: lot
    }
  end

  defp session_token_fixture(user), do: RockcutApi.AccountsFixtures.session_token_fixture(user)

  # path, schema, the other required fields as JSON, field, an in-range value, message
  defp cases(c) do
    [
      {"/api/brands", Brewing.Brand, ~s("name": "[TEST] Ranges Brand"), "target_abv", "5.25",
       "must be between 0 and 100"},
      {"/api/batches", Brewing.Batch, ~s("brand_id": #{c.brand.id}), "actual_og", "1.061",
       "must be a specific gravity between 0.950 and 1.200"},
      {"/api/brew_turns", Brewing.BrewTurn,
       ~s("batch_id": #{c.batch.id}, "recipe_id": #{c.recipe.id}, "turn_number": 1),
       "actual_efficiency", "73.5", "must be between 0 and 100"},
      {"/api/batch_log_entries", Brewing.BatchLogEntry,
       ~s("batch_id": #{c.batch.id}, "timestamp": "2026-10-28T12:00:00Z", "event_type": "ph_reading"),
       "ph", "5.2", "must be between 0 and 14"},
      {"/api/ingredient_lots", Brewing.IngredientLot,
       ~s("ingredient_id": #{c.hop.id}, "lot_number": "R-2"), "alpha_acid", "5.5",
       "must be between 0 and 100"},
      {"/api/recipes", Brewing.Recipe, ~s("brand_id": #{c.recipe_brand.id}), "batch_size", "15",
       "must be more than 0 and at most 10,000"},
      {"/api/recipe_ingredients", Brewing.RecipeIngredient,
       ~s("recipe_id": #{c.recipe.id}, "lot_id": #{c.lot.id}, "unit": "lb"), "amount", "2.5",
       "must be more than 0 and at most 1,000,000"},
      {"/api/mash_steps", Brewing.MashStep,
       ~s("recipe_id": #{c.recipe.id}, "step_number": 1, "name": "Sacch Rest", "duration": 60),
       "temperature", "152", "must be between 32 and 212"},
      {"/api/recipe_process_steps", Brewing.RecipeProcessStep,
       ~s("recipe_id": #{c.recipe.id}, "step_number": 1, "name": "Crash"), "temperature", "34",
       "must be between 20 and 212"},
      {"/api/water_profiles", Brewing.WaterProfile, ~s("recipe_id": #{c.recipe.id}), "sulfate",
       "150", "must be between 0 and 2,000"}
    ]
  end

  defp post_json(conn, path, body) do
    conn |> put_req_header("content-type", "application/json") |> post(path, body)
  end

  test "each brewing resource saves an in-range number and refuses a 40-digit one", c do
    for {path, schema, rest, field, ok, message} <- cases(c) do
      before = Repo.aggregate(schema, :count)

      conn = post_json(c.conn, path, ~s({#{rest}, "#{field}": #{@forty_digits}}))
      assert json_response(conn, 422)["errors"][field] == [message], "#{path} #{field}"
      assert Repo.aggregate(schema, :count) == before, "#{path} saved a refused value"

      conn = post_json(c.conn, path, ~s({#{rest}, "#{field}": #{ok}}))
      saved = json_response(conn, 201)["data"]
      assert Decimal.equal?(Decimal.new(to_string(saved[field])), Decimal.new(ok)), path
    end
  end

  test "an update to ABV 1000 or 1e308 is refused and the old value stays", c do
    {:ok, brand} = Brewing.create_brand(%{name: "[TEST] Ranges Keep", target_abv: "5.25"})

    for value <- ["1000", "1e308", "-5"] do
      conn =
        c.conn
        |> put_req_header("content-type", "application/json")
        |> put("/api/brands/#{brand.id}", ~s({"target_abv": #{value}}))

      assert json_response(conn, 422)["errors"]["target_abv"] == ["must be between 0 and 100"]
    end

    assert Decimal.equal?(Repo.reload!(brand).target_abv, Decimal.new("5.25"))
  end
end
