defmodule RockcutApiWeb.RecipeIngredientSortOrderTest do
  # D55 §2.5 (task 4981): Sort Order left empty sends `"sort_order": null`; it
  # saves at the end of the recipe's list (create and update) instead of a 500.
  use RockcutApiWeb.ConnCase

  alias RockcutApi.Brewing
  alias RockcutApi.Brewing.RecipeIngredient
  alias RockcutApi.Repo

  setup %{conn: conn} do
    owner = RockcutApi.AccountsFixtures.owner_fixture()
    token = RockcutApi.AccountsFixtures.session_token_fixture(owner)

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> put_req_header("content-type", "application/json")

    {:ok, brand} = Brewing.create_brand(%{name: "[TEST] Sort Pale"})
    {:ok, recipe} = Brewing.create_recipe(%{brand_id: brand.id, batch_size: 15})
    {:ok, cat} = Brewing.create_ingredient_category(%{name: "Malt"})
    {:ok, malt} = Brewing.create_ingredient(%{name: "Pilsner", category_id: cat.id})
    {:ok, lot} = Brewing.create_ingredient_lot(%{ingredient_id: malt.id, lot_number: "S-1"})

    %{conn: conn, recipe: recipe, lot: lot}
  end

  defp body(recipe, lot, extra),
    do:
      Jason.encode!(
        Map.merge(%{recipe_id: recipe.id, lot_id: lot.id, amount: 10, unit: "lb"}, extra)
      )

  defp create(conn, recipe, lot, extra) do
    conn |> post("/api/recipe_ingredients", body(recipe, lot, extra)) |> json_response(201)
  end

  defp stored(id), do: Repo.get!(RecipeIngredient, id).sort_order

  test "create with null: the first goes at 0, the next after the last", c do
    first = create(c.conn, c.recipe, c.lot, %{sort_order: nil})["data"]
    assert stored(first["id"]) == 0

    _ = create(c.conn, c.recipe, c.lot, %{sort_order: 7})
    next = create(c.conn, c.recipe, c.lot, %{sort_order: nil})["data"]
    assert stored(next["id"]) == 8
  end

  test "create without sort_order goes at the end", c do
    _ = create(c.conn, c.recipe, c.lot, %{sort_order: 3})
    data = create(c.conn, c.recipe, c.lot, %{})["data"]
    assert stored(data["id"]) == 4
  end

  test "an explicit sort_order still saves as given", c do
    data = create(c.conn, c.recipe, c.lot, %{sort_order: 2})["data"]
    assert stored(data["id"]) == 2
  end

  test "update with null moves it after the others", c do
    a = create(c.conn, c.recipe, c.lot, %{sort_order: 1})["data"]
    _ = create(c.conn, c.recipe, c.lot, %{sort_order: 5})

    c.conn
    |> put("/api/recipe_ingredients/#{a["id"]}", Jason.encode!(%{sort_order: nil}))
    |> json_response(200)

    assert stored(a["id"]) == 6
  end

  test "update with null on the last one keeps it last, not one further", c do
    _ = create(c.conn, c.recipe, c.lot, %{sort_order: 1})
    last = create(c.conn, c.recipe, c.lot, %{sort_order: 4})["data"]

    c.conn
    |> put("/api/recipe_ingredients/#{last["id"]}", Jason.encode!(%{sort_order: nil, amount: 12}))
    |> json_response(200)

    assert stored(last["id"]) == 2
  end

  test "an update without sort_order leaves it where it is", c do
    a = create(c.conn, c.recipe, c.lot, %{sort_order: 1})["data"]
    _ = create(c.conn, c.recipe, c.lot, %{sort_order: 5})

    c.conn
    |> put("/api/recipe_ingredients/#{a["id"]}", Jason.encode!(%{amount: 11}))
    |> json_response(200)

    assert stored(a["id"]) == 1
  end

  # Lead decisions 6, gap 9: "" is "not set", like null (it saved 0, the top).
  test "\"\" is the end too, on create and update", c do
    a = create(c.conn, c.recipe, c.lot, %{sort_order: 3})["data"]
    blank = create(c.conn, c.recipe, c.lot, %{sort_order: ""})["data"]
    assert stored(blank["id"]) == 4

    c.conn
    |> put("/api/recipe_ingredients/#{a["id"]}", Jason.encode!(%{sort_order: " "}))
    |> json_response(200)

    assert stored(a["id"]) == 5
  end
end
