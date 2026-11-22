defmodule RockcutApiWeb.D65Fix4Test do
  @moduledoc """
  D65 lead decisions 4 (DEV QA recheck 1, gap 8) on the API: a feature value
  must have the shape its feature takes, or it's a 422 and nothing is
  stored or cleared. Before, `%{"value"}`, `%{"lo"}` or `%{}` as a product's
  Brix read as "no range" and silently cleared the stored one.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2]

  alias RockcutApi.Tasks

  setup do
    p = personas(~w(brewer1))
    Map.put(d65_catalog!(), :brewer, p["brewer1"])
  end

  defp req(user, verb, path, params) do
    conn = call(user, verb, path, params)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  defp product!(c, attrs) do
    {201, %{"data" => p}} = req(c.brewer, :post, "/api/ingredient_products", attrs)
    p
  end

  defp get_product(c, id) do
    {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{id}", %{})
    p
  end

  # A product edit carries its lock_version (D62).
  defp put_product(c, id, attrs) do
    lock = get_product(c, id)["lock_version"]
    req(c.brewer, :put, "/api/ingredient_products/#{id}", Map.put(attrs, "lock_version", lock))
  end

  defp lot(c, product_id, features) do
    req(c.brewer, :post, "/api/ingredient_lots", %{
      "product_id" => product_id,
      "received_date" => Date.to_iso8601(Tasks.today()),
      "initial_kind" => "opening",
      "initial_quantity" => "10",
      "features" => features
    })
  end

  defp purée!(c, brix, form \\ "Purée") do
    product!(c, %{
      "ingredient_id" => c.strawberry.id,
      "form" => form,
      "unit" => "gal",
      "features" => %{"brix" => brix}
    })
  end

  describe "product Brix (a range)" do
    test "{value}, {lo}, {} and an extra key are refused on create and on edit; the stored Brix stays",
         c do
      p = purée!(c, %{"low" => "12"})

      for bad <- [%{"value" => "12"}, %{"lo" => "12"}, %{}, %{"low" => "12", "lo" => "13"}] do
        assert {422, %{"errors" => %{"features" => %{"brix" => ["Brix takes low and/or high"]}}}} =
                 req(c.brewer, :post, "/api/ingredient_products", %{
                   "ingredient_id" => c.strawberry.id,
                   "form" => "Whole",
                   "unit" => "lb",
                   "features" => %{"brix" => bad}
                 }),
               inspect(bad)

        assert {422, %{"errors" => %{"features" => %{"brix" => ["Brix takes low and/or high"]}}}} =
                 put_product(c, p["id"], %{
                   "features" => %{"brix" => bad}
                 }),
               inspect(bad)

        assert get_product(c, p["id"])["features"]["brix"]["value"] == "12"
      end

      # A number is still "a range" (D62's words).
      assert {422,
              %{"errors" => %{"features" => %{"brix" => ["Brix is a range: give low and high"]}}}} =
               put_product(c, p["id"], %{
                 "features" => %{"brix" => "12"}
               })
    end

    test "an edit that leaves Brix out keeps it; null or both ends blank clears it", c do
      p = purée!(c, %{"low" => "12"})

      assert {200,
              %{"data" => %{"notes" => "kept", "features" => %{"brix" => %{"value" => "12"}}}}} =
               put_product(c, p["id"], %{"notes" => "kept"})

      assert {200, %{"data" => %{"features" => %{"brix" => %{"value" => "12"}}}}} =
               put_product(c, p["id"], %{"features" => %{}})

      assert {200, %{"data" => %{"features" => features}}} =
               put_product(c, p["id"], %{
                 "features" => %{"brix" => nil}
               })

      refute Map.has_key?(features, "brix")

      q = purée!(c, %{"low" => "6", "high" => "9"}, "Whole")

      assert {200, %{"data" => %{"features" => features}}} =
               put_product(c, q["id"], %{
                 "features" => %{"brix" => %{"low" => nil, "high" => ""}}
               })

      refute Map.has_key?(features, "brix")
    end
  end

  describe "single values (lot Brix, extract)" do
    test "a lot's Brix given as a range or with an unknown key is refused; {value} is still fine",
         c do
      p = purée!(c, %{"low" => "6", "high" => "9"})

      for bad <- [
            %{"low" => "8"},
            %{"low" => "8", "high" => "9"},
            %{"value" => "8", "lo" => "8"},
            %{}
          ] do
        assert {422, %{"errors" => %{"features" => %{"brix" => ["Brix takes one value"]}}}} =
                 lot(c, p["id"], %{"brix" => bad}),
               inspect(bad)
      end

      assert {201, %{"data" => %{"features" => %{"brix" => %{"value" => "8"}}}}} =
               lot(c, p["id"], %{"brix" => %{"value" => "8"}})

      {201, %{"data" => l}} = lot(c, p["id"], %{"brix" => "8.5"})

      assert {422, %{"errors" => %{"features" => %{"brix" => ["Brix takes one value"]}}}} =
               req(c.brewer, :put, "/api/ingredient_lots/#{l["id"]}", %{
                 "features" => %{"brix" => %{"low" => "7"}}
               })

      {200, %{"data" => kept}} = req(c.brewer, :get, "/api/ingredient_lots/#{l["id"]}", %{})
      assert kept["features"]["brix"]["value"] == "8.5"
    end

    test "an extract given as a map without value, or a map as its value, is refused", c do
      dry =
        product!(c, %{
          "ingredient_id" => c.dextrose.id,
          "form" => "Dry",
          "features" => %{"extract_fgdb" => "91"}
        })

      assert {422,
              %{"errors" => %{"features" => %{"extract_fgdb" => ["Extract takes one value"]}}}} =
               put_product(c, dry["id"], %{
                 "features" => %{"extract_fgdb" => %{"low" => "80"}}
               })

      assert {422,
              %{"errors" => %{"features" => %{"extract_fgdb" => ["Extract is not a number"]}}}} =
               put_product(c, dry["id"], %{
                 "features" => %{"extract_fgdb" => %{"value" => %{"low" => "80"}}}
               })

      assert get_product(c, dry["id"])["features"]["extract_fgdb"]["value"] == "91"
    end
  end

  test "an ion given as a map is refused and the stored value stays", c do
    put = &req(c.brewer, :put, "/api/ingredients/#{c.gypsum.id}/ions", %{"ions" => &1})
    assert {200, _} = put.(%{"ca_ppm_per_g_gal" => "61.5"})

    assert {422, %{"errors" => %{"ions" => %{"ca_ppm_per_g_gal" => [message]}}}} =
             put.(%{"ca_ppm_per_g_gal" => %{"value" => "70"}})

    assert message =~ "is not a number"

    assert {200, %{"data" => ions}} =
             req(c.brewer, :get, "/api/ingredients/#{c.gypsum.id}/ions", %{})

    assert inspect(ions) =~ "61.5"
  end
end
