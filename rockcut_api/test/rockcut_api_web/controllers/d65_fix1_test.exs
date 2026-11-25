defmodule RockcutApiWeb.D65Fix1Test do
  @moduledoc """
  D65 lead decisions 1 (local QA fix cycle) on the API: deletes that hit a
  restrict key are 422s with a sentence (gap 13), a lot's pack name is its
  category's (gap 11), the Brix wording (gap 2), the default pack (gap 3),
  Brix with one place in the lot label (gap 4), "1 tablet" (gap 6), the
  "tablets" label on per-unit sums (gap 8), Totals' None manufacturer (gap
  9), product names any case and "None" (gap 12), and the form fixed once a
  product has a lot. Every rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2, offer!: 4]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.Ingredient
  alias RockcutApi.Ingredients.{Contract, ContractLine, Units}

  setup do
    p = personas(~w(owner brewer1))
    c = Map.merge(grain_catalog!(), d65_catalog!())
    Map.merge(c, %{brewer: p["brewer1"], owner: p["owner"]})
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp today, do: Date.to_iso8601(Tasks.today())

  defp product!(c, attrs) do
    {201, %{"data" => p}} = req(c.brewer, :post, "/api/ingredient_products", attrs)
    p
  end

  defp lot(c, product_id, extra) do
    req(
      c.brewer,
      :post,
      "/api/ingredient_lots",
      Map.merge(
        %{
          "product_id" => product_id,
          "received_date" => today(),
          "initial_kind" => "opening",
          "initial_quantity" => "10",
          # A product with an active offer needs its lots' supplier (D62 lead decisions 5).
          "supplier_party_id" => c.bsg.id
        },
        extra
      )
    )
  end

  defp lot!(c, product_id, extra) do
    {201, %{"data" => l}} = lot(c, product_id, extra)
    l
  end

  defp offer!(c, product_id, pack, size) do
    {201, %{"data" => o}} =
      req(c.brewer, :post, "/api/supplier_offers", %{
        "product_id" => product_id,
        "supplier_party_id" => c.bsg.id,
        "pack_name" => pack,
        "pack_size" => size
      })

    o
  end

  defp tablets!(c),
    do: product!(c, %{"ingredient_id" => c.whirlfloc.id, "form" => "Tablet", "unit" => "each"})

  describe "gap 13: deletes on a restrict key are 422s with a sentence" do
    test "an ingredient with a product: 422, and the reason is on the ingredient; without one it deletes",
         c do
      product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})

      assert base(req(c.brewer, :delete, "/api/ingredients/#{c.strawberry.id}")) ==
               "Strawberry has products; deactivate them instead"

      assert {200,
              %{
                "data" => %{
                  "delete_blocked" => "Strawberry has products; deactivate them instead"
                }
              }} =
               req(c.brewer, :get, "/api/ingredients/#{c.strawberry.id}")

      assert {200, %{"data" => listed}} =
               req(c.brewer, :get, "/api/ingredients", %{"category_id" => c.fruits.id})

      assert Enum.find(listed, &(&1["id"] == c.strawberry.id))["delete_blocked"] =~ "has products"

      assert {200, %{"data" => %{"delete_blocked" => nil}}} =
               req(c.brewer, :get, "/api/ingredients/#{c.cinnamon.id}")

      assert {204, nil} = req(c.brewer, :delete, "/api/ingredients/#{c.cinnamon.id}")
      refute Repo.get(Ingredient, c.cinnamon.id)
    end

    test "a product on a contract line with no offer or lot: 422, not the foreign key's 500", c do
      contract = Repo.insert!(%Contract{supplier_party_id: c.bsg.id, year: 2026})
      hop = product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})

      Repo.insert!(%ContractLine{
        contract_id: contract.id,
        product_id: hop["id"],
        quantity: Decimal.new(1),
        price: Decimal.new(1)
      })

      assert base(req(c.brewer, :delete, "/api/ingredient_products/#{hop["id"]}")) =~
               "deactivate it instead"
    end

    test "an offer a contract line names (another supplier's contract): 422", c do
      contract = Repo.insert!(%Contract{supplier_party_id: c.rahr.id, year: 2026})

      Repo.insert!(%ContractLine{
        contract_id: contract.id,
        product_id: c.product.id,
        offer_id: c.offer.id,
        quantity: Decimal.new(1),
        price: Decimal.new(1)
      })

      assert base(req(c.owner, :delete, "/api/supplier_offers/#{c.offer.id}")) ==
               "A contract covers this offer; deactivate it instead"
    end
  end

  describe "gap 11: a lot's pack name is its category's" do
    test "a fruit or Process Aids lot in a sack is refused (create, edit); a pail and a tub are taken",
         c do
      puree =
        product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})

      tabs = tablets!(c)

      assert %{"pack_name" => ["must be pail or drum or case or bag or box"]} =
               errors(lot(c, puree["id"], %{"pack_name" => "sack", "pack_size" => "5"}))

      assert %{"pack_name" => ["must be jug or bottle or bag or tub"]} =
               errors(lot(c, tabs["id"], %{"pack_name" => "sack", "pack_size" => "500"}))

      pail = lot!(c, puree["id"], %{"pack_name" => "pail", "pack_size" => "5"})

      assert lot!(c, tabs["id"], %{"pack_name" => "tub", "pack_size" => "500"})["pack_name"] ==
               "tub"

      assert %{"pack_name" => [_]} =
               errors(
                 req(c.brewer, :put, "/api/ingredient_lots/#{pail["id"]}", %{
                   "pack_name" => "sack"
                 })
               )

      assert {200, _} =
               req(c.brewer, :put, "/api/ingredient_lots/#{pail["id"]}", %{"lot_number" => "P-1"})
    end

    test "grain lots keep sack and hop lots box", c do
      bsg = %{"supplier_party_id" => c.bsg.id}

      assert lot!(c, c.product.id, Map.merge(bsg, %{"pack_name" => "sack", "pack_size" => "55"}))[
               "pack_name"
             ] == "sack"

      assert %{"pack_name" => ["must be sack"]} =
               errors(
                 lot(
                   c,
                   c.product.id,
                   Map.merge(bsg, %{"pack_name" => "pail", "pack_size" => "55"})
                 )
               )
    end
  end

  describe "gap 2: Brix wording" do
    test "on a sugar product (any form) it belongs on Liquid lots; on a Dry lot it's for Liquid sugars",
         c do
      for form <- ~w(Liquid Dry) do
        assert %{
                 "features" => %{
                   "brix" => ["Brix is entered on Liquid sugar lots, not on the product"]
                 }
               } =
                 errors(
                   req(c.brewer, :post, "/api/ingredient_products", %{
                     "ingredient_id" => c.molasses.id,
                     "form" => form,
                     "unit" => "lb",
                     "features" => %{"brix" => "80"}
                   })
                 )
      end

      dry = product!(c, %{"ingredient_id" => c.dextrose.id, "form" => "Dry"})

      assert %{"features" => %{"brix" => ["Brix is only for Liquid sugars"]}} =
               errors(lot(c, dry["id"], %{"features" => %{"brix" => "40"}}))
    end
  end

  describe "gap 3: the default pack is one the category takes" do
    test "a fl oz spice offer and lot start as a bottle (jug isn't a spice pack); a gal fruit one a pail",
         c do
      vanilla =
        product!(c, %{"ingredient_id" => c.vanilla.id, "form" => "Extract", "unit" => "fl oz"})

      {201, %{"data" => offer}} =
        req(c.brewer, :post, "/api/supplier_offers", %{
          "product_id" => vanilla["id"],
          "supplier_party_id" => c.bsg.id,
          "pack_size" => "32"
        })

      assert offer["pack_name"] == "bottle"

      assert lot!(c, vanilla["id"], %{"pack_size" => "32", "supplier_party_id" => c.bsg.id})[
               "pack_name"
             ] == "bottle"

      puree =
        product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})

      assert lot!(c, puree["id"], %{"pack_size" => "5"})["pack_name"] == "pail"
    end
  end

  test "gap 4: a lot's label shows Brix with its one place (14.0 °Bx, 8.5 °Bx)", c do
    puree = product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})
    whole = lot!(c, puree["id"], %{"lot_number" => "W", "features" => %{"brix" => "14.0"}})
    half = lot!(c, puree["id"], %{"lot_number" => "H", "features" => %{"brix" => "8.5"}})
    assert whole["label"] =~ ~r/ · W · 14\.0 °Bx$/
    assert half["label"] =~ ~r/ · H · 8\.5 °Bx$/
  end

  test "gap 6: exactly 1 tablet is singular; 0 and 2 are plural; other units unchanged" do
    assert Units.format_quantity(Decimal.new(1), "tub", Decimal.new(500), "tablets", "packs") ==
             "1 tablet"

    assert Units.format_quantity(Decimal.new(-1), "tub", nil, "tablets", "lb") == "1 tablet"
    assert Units.format_quantity(Decimal.new(2), "tub", nil, "tablets", "lb") == "2 tablets"

    assert Units.format_quantity(Decimal.new(501), "tub", Decimal.new(500), "tablets", "packs") ==
             "1 tub 1 tablet"

    assert Units.format_quantity(Decimal.new(1), "bag", nil, "lb", "lb") == "1 lb"
  end

  describe "gap 8: a per-unit sum of only Tablet products says tablets" do
    test "an order's total and the inventory totals; a mix of Tablet and other each says each",
         c do
      tabs = tablets!(c)
      tub = offer!(c, tabs["id"], "tub", "500")
      price!(%{id: tub["id"]}, "92.00")

      {201, %{"data" => order}} =
        req(c.brewer, :post, "/api/purchase_orders", %{
          "supplier_party_id" => c.bsg.id,
          "ordered_on" => today(),
          "lines" => [%{"offer_id" => tub["id"], "packs_ordered" => 1}]
        })

      assert [%{"unit" => "each", "unit_label" => "tablets", "quantity" => q}] = order["by_unit"]
      assert Decimal.eq?(Decimal.new(q), 500)

      lot!(c, tabs["id"], %{
        "pack_name" => "tub",
        "pack_size" => "500",
        "initial_quantity" => "600"
      })

      totals = fn ->
        elem(req(c.brewer, :get, "/api/ingredient_totals/inventory"), 1)["data"]["total"][
          "by_unit"
        ]
      end

      assert %{"unit_label" => "tablets"} = Enum.find(totals.(), &(&1["unit"] == "each"))

      powder =
        product!(c, %{"ingredient_id" => c.whirlfloc.id, "form" => "Powder", "unit" => "each"})

      lot!(c, powder["id"], %{
        "pack_name" => "tub",
        "pack_size" => "10",
        "initial_quantity" => "10"
      })

      assert %{"unit_label" => "each"} = Enum.find(totals.(), &(&1["unit"] == "each"))
    end
  end

  test "gap 9: Totals' manufacturer=none is the products with no manufacturer", c do
    tabs = tablets!(c)
    lot!(c, tabs["id"], %{"pack_name" => "tub", "pack_size" => "500"})

    lot!(c, c.product.id, %{
      "pack_name" => "sack",
      "pack_size" => "55",
      "supplier_party_id" => c.bsg.id
    })

    {200, %{"data" => %{"rows" => rows}}} =
      req(c.brewer, :get, "/api/ingredient_totals/inventory", %{"manufacturer" => "none"})

    assert Enum.map(rows, & &1["product_id"]) == [tabs["id"]]

    {200, %{"data" => %{"rows" => all}}} = req(c.brewer, :get, "/api/ingredient_totals/inventory")
    assert length(all) == 2
  end

  describe "gap 12: product names" do
    test "a name that differs only in case is a duplicate; 'None' in any case is refused", c do
      body = %{"ingredient_id" => c.whirlfloc.id, "form" => "Tablet", "unit" => "each"}
      product!(c, Map.put(body, "name", "KT-872"))

      assert base(
               req(c.brewer, :post, "/api/ingredient_products", Map.put(body, "name", "kt-872"))
             ) ==
               "There's already a Whirlfloc KT-872 with manufacturer None."

      for name <- ["None", "none", " NONE "] do
        assert base(req(c.brewer, :post, "/api/ingredient_products", Map.put(body, "name", name))) ==
                 "'None' means no manufacturer; pick another product name"
      end

      assert product!(c, Map.put(body, "name", "Nonesuch"))["name"] == "Nonesuch"
    end

    test "with a manufacturer too (grain), any case", c do
      product!(c, %{
        "ingredient_id" => c.two_row.id,
        "manufacturer_party_id" => c.rahr.id,
        "name" => "Pale"
      })

      assert {422, _} =
               req(c.brewer, :post, "/api/ingredient_products", %{
                 "ingredient_id" => c.two_row.id,
                 "manufacturer_party_id" => c.rahr.id,
                 "name" => "PALE"
               })
    end
  end

  test "the form is fixed once a product has a lot (the unit already was)", c do
    tabs = tablets!(c)
    path = "/api/ingredient_products/#{tabs["id"]}"

    assert {200, %{"data" => %{"form" => "Liquid"} = changed}} =
             req(c.brewer, :put, path, %{
               "form" => "Liquid",
               "lock_version" => tabs["lock_version"]
             })

    assert {200, %{"data" => back}} =
             req(c.brewer, :put, path, %{
               "form" => "Tablet",
               "lock_version" => changed["lock_version"]
             })

    lot!(c, tabs["id"], %{"pack_name" => "tub", "pack_size" => "500"})

    assert %{"form" => ["This product has lots, so its form stays Tablet"]} =
             errors(
               req(c.brewer, :put, path, %{
                 "form" => "Liquid",
                 "lock_version" => back["lock_version"]
               })
             )

    assert {200, _} =
             req(c.brewer, :put, path, %{
               "notes" => "kept",
               "lock_version" => back["lock_version"]
             })
  end
end
