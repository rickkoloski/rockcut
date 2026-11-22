defmodule RockcutApiWeb.D65Stop3Test do
  @moduledoc """
  D65 Stop 3 (Stop 2 LEAD note 5): an ingredient's ions save with it, in one
  request and one transaction (`Ions.save_ingredient/2`): both are written or
  neither.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.Ingredient

  setup do
    p = personas(~w(brewer1))
    c = Map.merge(grain_catalog!(), d65_catalog!())
    Map.put(c, :brewer, p["brewer1"])
  end

  defp req(user, verb, path, params) do
    conn = call(user, verb, path, params)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  test "create and change a salt with its ions in one request", c do
    assert {201, %{"data" => made}} =
             req(c.brewer, :post, "/api/ingredients", %{
               "name" => "Calcium Chloride (Hydrous)",
               "category_id" => c.salts.id,
               "formula" => "CaCl₂·2H₂O",
               "ions" => %{"ca_ppm_per_g_gal" => "72.0", "cl_ppm_per_g_gal" => "127.4"}
             })

    assert Map.new(made["ions"], fn {k, v} -> {k, Decimal.to_float(Decimal.new(v))} end) ==
             %{"ca_ppm_per_g_gal" => 72.0, "cl_ppm_per_g_gal" => 127.4}

    assert {200, %{"data" => changed}} =
             req(c.brewer, :put, "/api/ingredients/#{made["id"]}", %{
               "name" => "Calcium Chloride (Dihydrate)",
               "ions" => %{"cl_ppm_per_g_gal" => nil}
             })

    assert changed["name"] == "Calcium Chloride (Dihydrate)"
    assert Map.keys(changed["ions"]) == ["ca_ppm_per_g_gal"]
  end

  test "a bad ion value leaves the ingredient's name unchanged", c do
    assert {422, %{"errors" => %{"ions" => %{"ca_ppm_per_g_gal" => [_]}}}} =
             req(c.brewer, :put, "/api/ingredients/#{c.gypsum.id}", %{
               "name" => "Renamed Gypsum",
               "ions" => %{"ca_ppm_per_g_gal" => "61.55"}
             })

    assert Repo.get!(Ingredient, c.gypsum.id).name == "Calcium Sulfate (Gypsum)"
  end

  test "ions on a new ingredient outside Water Salts: refused, and no ingredient is made", c do
    assert {422, %{"errors" => %{"ions" => ["Only a Water Salts ingredient has ion values"]}}} =
             req(c.brewer, :post, "/api/ingredients", %{
               "name" => "Kiwi",
               "category_id" => c.fruits.id,
               "ions" => %{"ca_ppm_per_g_gal" => "1"}
             })

    refute Repo.get_by(Ingredient, name: "Kiwi")

    # Without ions it's the plain save.
    assert {201, %{"data" => %{"name" => "Kiwi"}}} =
             req(c.brewer, :post, "/api/ingredients", %{
               "name" => "Kiwi",
               "category_id" => c.fruits.id
             })
  end
end
