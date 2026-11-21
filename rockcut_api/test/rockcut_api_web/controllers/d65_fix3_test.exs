defmodule RockcutApiWeb.D65Fix3Test do
  @moduledoc """
  D65 lead decisions 3 (DEV QA fix cycle) on the API: a formula is set only
  on a Water Salts ingredient (gap 1). One stored before on another
  category is kept while it isn't changed, and can be cleared.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures

  alias RockcutApi.Repo
  alias RockcutApi.Brewing.Ingredient

  setup do
    p = personas(~w(brewer1))
    Map.put(d65_catalog!(), :brewer, p["brewer1"])
  end

  defp req(user, verb, path, params) do
    conn = call(user, verb, path, params)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  describe "gap 1: the formula is Water Salts only" do
    test "create: refused on a fruit, allowed on a water salt", c do
      assert {422, %{"errors" => %{"formula" => ["is only for Water Salts ingredients"]}}} =
               req(c.brewer, :post, "/api/ingredients", %{
                 "name" => "Mango",
                 "category_id" => c.fruits.id,
                 "formula" => "C6H12O6"
               })

      assert {201, %{"data" => %{"formula" => "CaCl₂"}}} =
               req(c.brewer, :post, "/api/ingredients", %{
                 "name" => "Calcium Chloride",
                 "category_id" => c.salts.id,
                 "formula" => "CaCl₂"
               })

      # No formula is fine anywhere.
      assert {201, %{"data" => %{"formula" => nil}}} =
               req(c.brewer, :post, "/api/ingredients", %{
                 "name" => "Peach",
                 "category_id" => c.fruits.id
               })
    end

    test "update: setting one elsewhere is refused; a stored one is kept, and can be cleared",
         c do
      assert {422, %{"errors" => %{"formula" => [_]}}} =
               req(c.brewer, :put, "/api/ingredients/#{c.cinnamon.id}", %{"formula" => "C9H8O"})

      # A value saved before the rule (stored directly, as QA's rows were).
      Repo.update!(Ecto.Changeset.change(c.strawberry, formula: "old probe"))

      assert {200, %{"data" => %{"formula" => "old probe", "notes" => "kept"}}} =
               req(c.brewer, :put, "/api/ingredients/#{c.strawberry.id}", %{"notes" => "kept"})

      assert {200, %{"data" => %{"formula" => "old probe"}}} =
               req(c.brewer, :put, "/api/ingredients/#{c.strawberry.id}", %{
                 "formula" => "old probe"
               })

      assert {422, _} =
               req(c.brewer, :put, "/api/ingredients/#{c.strawberry.id}", %{"formula" => "new"})

      assert {200, %{"data" => %{"formula" => nil}}} =
               req(c.brewer, :put, "/api/ingredients/#{c.strawberry.id}", %{"formula" => ""})

      assert Repo.get!(Ingredient, c.strawberry.id).formula == nil
    end
  end
end
