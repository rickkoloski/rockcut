defmodule RockcutApiWeb.D65Fix2Test do
  @moduledoc """
  D65 lead decisions 2 (QA recheck 1 leftovers) on the API: the duplicate
  refusal names the product that's there in its stored spelling, not the
  spelling typed (gap 15).
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2]

  setup do
    p = personas(~w(brewer1))
    Map.put(d65_catalog!(), :brewer, p["brewer1"])
  end

  defp req(user, verb, path, params) do
    conn = call(user, verb, path, params)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message

  defp product!(c, attrs) do
    {201, %{"data" => p}} = req(c.brewer, :post, "/api/ingredient_products", attrs)
    p
  end

  describe "gap 15: the duplicate names the existing product" do
    test "manufacturer None: create and rename say the stored spelling", c do
      body = %{"ingredient_id" => c.whirlfloc.id, "form" => "Tablet", "unit" => "each"}
      product!(c, Map.put(body, "name", "KT-872"))

      for typed <- ["kt-872", " Kt-872", "KT-872 "] do
        assert base(
                 req(c.brewer, :post, "/api/ingredient_products", Map.put(body, "name", typed))
               ) ==
                 "There's already a Whirlfloc KT-872 with manufacturer None."
      end

      other = product!(c, Map.put(body, "name", "KT-500"))

      assert base(
               req(c.brewer, :put, "/api/ingredient_products/#{other["id"]}", %{
                 "name" => "kt-872",
                 "lock_version" => other["lock_version"]
               })
             ) == "There's already a Whirlfloc KT-872 with manufacturer None."

      # Renaming a product to its own name in another case is allowed, and stored as typed.
      {200, %{"data" => renamed}} =
        req(c.brewer, :put, "/api/ingredient_products/#{other["id"]}", %{
          "name" => "kt-500",
          "lock_version" => other["lock_version"]
        })

      assert renamed["name"] == "kt-500"
    end

    test "with a manufacturer: the stored spelling in parentheses", c do
      body = %{
        "ingredient_id" => c.strawberry.id,
        "manufacturer_party_id" => c.oregon.id,
        "form" => "Purée",
        "unit" => "gal"
      }

      product!(c, Map.put(body, "name", "Aseptic Puree"))

      assert base(
               req(
                 c.brewer,
                 :post,
                 "/api/ingredient_products",
                 Map.put(body, "name", "aseptic puree")
               )
             ) ==
               "Oregon Fruit already has Purée Strawberry (Aseptic Puree)."
    end
  end
end
