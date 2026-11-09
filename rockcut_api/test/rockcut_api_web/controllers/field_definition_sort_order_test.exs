defmodule RockcutApiWeb.FieldDefinitionSortOrderTest do
  # D55 §2.10 (T12): the field-definition dialog sends `"sort_order": null` when
  # Sort Order is empty. It saves at the end of the category's fields on create
  # and update; left out of an update, the position stays.
  use RockcutApiWeb.ConnCase

  alias RockcutApi.Brewing
  alias RockcutApi.Brewing.CategoryFieldDefinition
  alias RockcutApi.Repo

  setup %{conn: conn} do
    owner = RockcutApi.AccountsFixtures.owner_fixture()
    token = RockcutApi.AccountsFixtures.session_token_fixture(owner)

    conn =
      conn
      |> put_req_header("authorization", "Bearer #{token}")
      |> put_req_header("content-type", "application/json")

    {:ok, cat} = Brewing.create_ingredient_category(%{name: "Yeast"})
    %{conn: conn, cat: cat}
  end

  defp create(c, name, extra) do
    body = Map.merge(%{category_id: c.cat.id, field_name: name, field_type: "text"}, extra)
    c.conn |> post("/api/category_field_definitions", Jason.encode!(body)) |> json_response(201)
  end

  defp stored(id), do: Repo.get!(CategoryFieldDefinition, id).sort_order

  test "create with null: the first goes at 0, the next after the last", c do
    first = create(c, "Attenuation", %{sort_order: nil})["data"]
    assert stored(first["id"]) == 0

    _ = create(c, "Flocculation", %{sort_order: 7})
    next = create(c, "Temp range", %{sort_order: nil})["data"]
    assert stored(next["id"]) == 8
  end

  test "create without sort_order goes at the end", c do
    _ = create(c, "Attenuation", %{sort_order: 3})
    data = create(c, "Flocculation", %{})["data"]
    assert stored(data["id"]) == 4
  end

  test "an explicit sort_order still saves as given", c do
    data = create(c, "Attenuation", %{sort_order: 2})["data"]
    assert stored(data["id"]) == 2
  end

  test "update with null moves it after the others", c do
    a = create(c, "Attenuation", %{sort_order: 1})["data"]
    _ = create(c, "Flocculation", %{sort_order: 5})

    c.conn
    |> put("/api/category_field_definitions/#{a["id"]}", Jason.encode!(%{sort_order: nil}))
    |> json_response(200)

    assert stored(a["id"]) == 6
  end

  test "an update without sort_order leaves it where it is", c do
    a = create(c, "Attenuation", %{sort_order: 1})["data"]
    _ = create(c, "Flocculation", %{sort_order: 5})

    c.conn
    |> put("/api/category_field_definitions/#{a["id"]}", Jason.encode!(%{required: true}))
    |> json_response(200)

    assert stored(a["id"]) == 1
  end

  # Lead decisions 6, gap 9: "" is "not set", like null (it saved 0, the top).
  test "\"\" is the end too, on create and update", c do
    a = create(c, "Attenuation", %{sort_order: 3})["data"]
    blank = create(c, "Flocculation", %{sort_order: ""})["data"]
    assert stored(blank["id"]) == 4

    c.conn
    |> put("/api/category_field_definitions/#{a["id"]}", Jason.encode!(%{sort_order: ""}))
    |> json_response(200)

    assert stored(a["id"]) == 5
  end
end
