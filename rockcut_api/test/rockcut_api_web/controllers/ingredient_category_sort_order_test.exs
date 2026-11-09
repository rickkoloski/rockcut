defmodule RockcutApiWeb.IngredientCategorySortOrderTest do
  # D55 lead decisions 6, gaps 8 and 9: the category dialog sends
  # `"sort_order": null` when Sort Order is empty, which was a 500 (the column
  # is NOT NULL). Same rule as §2.5/§2.10: null, "" or left out on create =
  # the end; null or "" on update = the end; left out of an update = stays.
  use RockcutApiWeb.ConnCase

  alias RockcutApi.Brewing.IngredientCategory
  alias RockcutApi.Repo

  setup %{conn: conn} do
    owner = RockcutApi.AccountsFixtures.owner_fixture()
    token = RockcutApi.AccountsFixtures.session_token_fixture(owner)

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> put_req_header("content-type", "application/json")

    %{conn: conn}
  end

  defp create(c, name, extra) do
    body = Map.merge(%{name: name}, extra)
    c.conn |> post("/api/ingredient_categories", Jason.encode!(body)) |> json_response(201)
  end

  defp update(c, id, body) do
    c.conn |> put("/api/ingredient_categories/#{id}", Jason.encode!(body)) |> json_response(200)
  end

  defp stored(id), do: Repo.get!(IngredientCategory, id).sort_order

  test "create with null: the first goes at 0, the next after the last", c do
    first = create(c, "Malt", %{sort_order: nil})["data"]
    assert stored(first["id"]) == 0

    _ = create(c, "Hops", %{sort_order: 7})
    next = create(c, "Yeast", %{sort_order: nil})["data"]
    assert stored(next["id"]) == 8
  end

  test "create with \"\" or without sort_order goes at the end", c do
    _ = create(c, "Malt", %{sort_order: 3})
    assert stored(create(c, "Hops", %{sort_order: ""})["data"]["id"]) == 4
    assert stored(create(c, "Yeast", %{})["data"]["id"]) == 5
  end

  test "an explicit sort_order still saves as given", c do
    assert stored(create(c, "Malt", %{sort_order: 2})["data"]["id"]) == 2
    assert stored(create(c, "Hops", %{sort_order: 0})["data"]["id"]) == 0
  end

  test "update with null or \"\" moves it after the others", c do
    a = create(c, "Malt", %{sort_order: 1})["data"]
    _ = create(c, "Hops", %{sort_order: 5})

    update(c, a["id"], %{sort_order: nil})
    assert stored(a["id"]) == 6

    b = create(c, "Yeast", %{sort_order: 2})["data"]
    update(c, b["id"], %{name: "Yeast 2", sort_order: ""})
    assert stored(b["id"]) == 7
    assert Repo.get!(IngredientCategory, b["id"]).name == "Yeast 2"
  end

  test "an update without sort_order leaves it where it is", c do
    a = create(c, "Malt", %{sort_order: 1})["data"]
    _ = create(c, "Hops", %{sort_order: 5})

    update(c, a["id"], %{name: "Malts"})
    assert stored(a["id"]) == 1
  end
end
