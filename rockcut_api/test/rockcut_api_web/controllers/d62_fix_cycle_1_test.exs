defmodule RockcutApiWeb.D62FixCycle1Test do
  @moduledoc """
  D62 local QA fix cycle 1 (`d62_lead_decisions_1.md`) on the API: hop
  offers have no form (gap 3); inventory totals rows carry the form and
  category key (gap 4); order totals per pack name (gap 11); a stale
  product save is refused (gap 9); receiving into an existing lot # with
  other values is refused (gap 10); the duplicate product is a `base`
  sentence (gap 1); Hops takes no subcategory. Gap 7 (A4, no change) is
  pinned by `ReceivingTotalsApiTest` "lot cost and value". Each rule has a
  refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.IngredientLot
  alias RockcutApi.Ingredients.{Movement, Product, PurchaseOrder, SupplierOffer}

  setup do
    p = personas(~w(owner brewer1 brewer2))
    c = grain_catalog!()
    c = Map.merge(c, hop_catalog!(c))
    price!(c.offer, "48.50")

    bsg_hop =
      Repo.insert!(%SupplierOffer{
        product_id: c.hop_product.id,
        supplier_party_id: c.bsg.id,
        pack_name: "box",
        pack_size: Decimal.new(11)
      })

    price!(bsg_hop, "165.00")

    Map.merge(c, %{p: p, brewer: p["brewer1"], brewer2: p["brewer2"], bsg_hop: bsg_hop})
  end

  defp iso(offset), do: Date.to_iso8601(Date.add(Tasks.today(), offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message

  defp eq(a, b), do: Decimal.eq?(Decimal.new(to_string(a)), Decimal.new(to_string(b)))

  defp on_hand(lot_id) do
    Repo.all(from(m in Movement, where: m.lot_id == ^lot_id, select: m.quantity))
    |> Enum.reduce(Decimal.new(0), &Decimal.add/2)
  end

  defp order!(c, lines) do
    {201, %{"data" => order}} =
      req(c.brewer, :post, "/api/purchase_orders", %{
        "supplier_party_id" => c.bsg.id,
        "ordered_on" => iso(0),
        "lines" => lines
      })

    order
  end

  describe "gap 3: milled/whole is grain's alone" do
    test "a hop offer stores no form, and one sent is refused", c do
      body = %{"product_id" => c.hop_product.id, "supplier_party_id" => c.root_shoot.id}

      for form <- ~w(whole milled) do
        assert %{"form" => ["Only grain offers are milled or whole"]} =
                 errors(req(c.brewer, :post, "/api/supplier_offers", Map.put(body, "form", form)))
      end

      {201, %{"data" => o}} = req(c.brewer, :post, "/api/supplier_offers", body)
      assert o["form"] == nil and o["pack_name"] == "box"
      assert Repo.get!(SupplierOffer, o["id"]).form == nil

      assert %{"form" => [_]} =
               errors(
                 req(c.brewer, :patch, "/api/supplier_offers/#{o["id"]}", %{"form" => "whole"})
               )

      assert {200, %{"data" => %{"form" => nil, "order_name" => "Citra box"}}} =
               req(c.brewer, :patch, "/api/supplier_offers/#{o["id"]}", %{
                 "order_name" => "Citra box",
                 "form" => ""
               })
    end

    test "a grain offer still needs one: whole by default, nil refused", c do
      body = %{
        "product_id" => c.product.id,
        "supplier_party_id" => c.root_shoot.id,
        "pack_size" => "50"
      }

      assert %{"form" => ["can't be blank"]} =
               errors(req(c.brewer, :post, "/api/supplier_offers", Map.put(body, "form", nil)))

      assert {201, %{"data" => %{"form" => "whole"}}} =
               req(c.brewer, :post, "/api/supplier_offers", body)

      assert {201, %{"data" => %{"form" => "milled"}}} =
               req(c.brewer, :post, "/api/supplier_offers", Map.put(body, "form", "milled"))
    end
  end

  describe "gap 9: a stale product save is refused" do
    test "two dialogs on one hop product: the second save is a 409 and writes nothing", c do
      path = "/api/ingredient_products/#{c.hop_product.id}"
      {200, %{"data" => opened}} = req(c.brewer, :get, path)
      assert opened["lock_version"] == 1

      assert {200, %{"data" => saved}} =
               req(c.brewer, :put, path, %{
                 "lock_version" => 1,
                 "features" => %{"alpha_acid_pct" => %{"low" => "10.5", "high" => "13"}}
               })

      assert saved["lock_version"] == 2 and
               eq(saved["features"]["alpha_acid_pct"]["value"], "10.5")

      # brewer2's dialog was opened at version 1 and changes only the origin;
      # it sends the ranges it opened with, as the dialog does.
      assert {409, %{"errors" => %{"base" => [message]}}} =
               req(c.brewer2, :put, path, %{
                 "lock_version" => 1,
                 "origin" => "Germany",
                 "features" => %{"alpha_acid_pct" => %{"low" => "11", "high" => "13"}}
               })

      assert message ==
               "Someone else changed this product since you opened it. Close and reopen it to see their change."

      {200, %{"data" => now}} = req(c.brewer, :get, path)
      assert now["origin"] == "USA" and now["lock_version"] == 2
      assert eq(now["features"]["alpha_acid_pct"]["value"], "10.5")

      assert {200, %{"data" => %{"origin" => "Germany", "lock_version" => 3}}} =
               req(c.brewer2, :put, path, %{"lock_version" => 2, "origin" => "Germany"})
    end

    test "grain products too; a save with no version or a bad one is a 422", c do
      path = "/api/ingredient_products/#{c.product.id}"

      assert %{"lock_version" => ["can't be blank"]} =
               errors(req(c.brewer, :put, path, %{"name" => "Pale"}))

      assert %{"lock_version" => ["is invalid"]} =
               errors(req(c.brewer, :put, path, %{"name" => "Pale", "lock_version" => "one"}))

      assert {200, %{"data" => %{"lock_version" => 2}}} =
               req(c.brewer, :put, path, %{"min_on_hand_packs" => 4, "lock_version" => "1"})

      assert {409, _} = req(c.brewer2, :put, path, %{"name" => "Pale", "lock_version" => 1})
      assert Repo.get!(Product, c.product.id).name == nil
    end
  end

  describe "gap 10: receiving into a lot # the product already has" do
    setup c do
      lot = hop_lot!(c.hop_product, Date.add(Tasks.today(), -10), "44", "14.1", "H1", 2025)

      order =
        order!(c, [
          %{"offer_id" => c.offer.id, "packs_ordered" => 1},
          %{"offer_id" => c.bsg_hop.id, "packs_ordered" => 2}
        ])

      grain_lot = stocked_lot!(c.product, Date.add(Tasks.today(), -10), "55", "G1")
      lot_features!(grain_lot, color_lovibond: "2.0")

      %{lot: lot, grain_lot: grain_lot, order: order}
    end

    defp receive(c, grain_alloc, hop_alloc) do
      [grain, hop] = c.order["lines"]

      req(c.brewer, :post, "/api/purchase_orders/#{c.order["id"]}/receive", %{
        "lines" => [
          %{
            "id" => grain["id"],
            "packs_received" => 1,
            "allocations" => [Map.merge(%{"lot_number" => "G1", "packs" => 1}, grain_alloc)]
          },
          %{
            "id" => hop["id"],
            "packs_received" => 2,
            "allocations" => [Map.merge(%{"lot_number" => " h1 ", "packs" => 2}, hop_alloc)]
          }
        ]
      })
    end

    test "a different crop year or alpha is refused, naming the lot's values; nothing is written",
         c do
      for hop <- [
            %{"crop_year" => 2020, "features" => %{"alpha_acid_pct" => "9.5"}},
            %{"crop_year" => "2020"},
            %{"features" => %{"alpha_acid_pct" => "14.2"}}
          ] do
        message = base(receive(c, %{}, hop))
        assert message =~ ~r/^Lot H1 already exists with crop year 2025/
        assert message =~ ~r/use a new lot number or leave its values$/
      end

      assert base(
               receive(c, %{}, %{"crop_year" => 2020, "features" => %{"alpha_acid_pct" => "9.5"}})
             ) ==
               "Lot H1 already exists with crop year 2025, alpha acid 14.10; use a new lot number or leave its values"

      assert eq(on_hand(c.lot.id), 44) and eq(on_hand(c.grain_lot.id), 55)
      assert Repo.get!(PurchaseOrder, c.order["id"]).status == "open"
      assert Repo.get!(IngredientLot, c.lot.id).crop_year == 2025
    end

    test "grain: a spec other than the lot's is refused too", c do
      assert base(receive(c, %{"features" => %{"color_lovibond" => "3.0"}}, %{})) ==
               "Lot G1 already exists with color 2.00; use a new lot number or leave its values"

      assert base(receive(c, %{"crop_year" => 2025}, %{})) ==
               "Lot G1 already exists with no crop year; use a new lot number or leave its values"
    end

    test "the lot's own values, or none, add to it", c do
      assert {200, %{"data" => %{"status" => "received"}}} =
               receive(c, %{"features" => %{"color_lovibond" => "2"}}, %{
                 "crop_year" => 2025,
                 "features" => %{"alpha_acid_pct" => "14.10"}
               })

      assert eq(on_hand(c.lot.id), 66) and eq(on_hand(c.grain_lot.id), 110)

      lots =
        Repo.all(from(l in IngredientLot, where: l.product_id == ^c.hop_product.id))

      assert length(lots) == 1
    end

    # D62 lead decisions 2, gap 16: a blank on the lot is a value (was a 500).
    test "a spec the lot has blank, or a blank for one it has, is refused; nothing is written",
         c do
      for {feature, value, label} <- [
            {"beta_acid_pct", "4", "no beta acid"},
            {"total_oil_ml_100g", "2", "no total oil"}
          ] do
        assert base(
                 receive(c, %{}, %{
                   "crop_year" => 2025,
                   "features" => %{"alpha_acid_pct" => "14.1", feature => value}
                 })
               ) =~
                 ~r/^Lot H1 already exists with crop year 2025, alpha acid 14.10, #{label}; use a new lot number or leave its values$/
      end

      assert base(receive(c, %{"features" => %{"diastatic_power_lintner" => "140"}}, %{})) ==
               "Lot G1 already exists with no diastatic power; use a new lot number or leave its values"

      assert base(receive(c, %{}, %{"features" => %{"alpha_acid_pct" => nil}})) ==
               "Lot H1 already exists with crop year 2025, alpha acid 14.10; use a new lot number or leave its values"

      assert base(receive(c, %{"features" => %{"color_lovibond" => nil}}, %{})) ==
               "Lot G1 already exists with color 2.00; use a new lot number or leave its values"

      assert {200, _} =
               receive(c, %{"features" => %{"diastatic_power_lintner" => nil}}, %{
                 "features" => %{"beta_acid_pct" => nil}
               })

      assert eq(on_hand(c.lot.id), 66) and eq(on_hand(c.grain_lot.id), 110)
    end

    # D62 lead decisions 5, gap 2: a crop year sent blank is a value too.
    test "a crop year sent blank (nil, \"\" or spaces) for a lot that has one is refused; nothing is written",
         c do
      for blank <- [nil, "", "  "] do
        assert base(
                 receive(c, %{}, %{
                   "crop_year" => blank,
                   "features" => %{"alpha_acid_pct" => "14.1"}
                 })
               ) ==
                 "Lot H1 already exists with crop year 2025, alpha acid 14.10; use a new lot number or leave its values"
      end

      assert eq(on_hand(c.lot.id), 44) and eq(on_hand(c.grain_lot.id), 55)
      assert Repo.get!(PurchaseOrder, c.order["id"]).status == "open"

      # A blank for a lot with none (grain) matches; a key left out leaves the values.
      assert {200, _} =
               receive(c, %{"crop_year" => nil}, %{"features" => %{"alpha_acid_pct" => "14.1"}})

      assert eq(on_hand(c.lot.id), 66) and eq(on_hand(c.grain_lot.id), 110)
      assert Repo.get!(IngredientLot, c.lot.id).crop_year == 2025
    end

    test "nothing sent adds to it as before", c do
      assert {200, _} = receive(c, %{}, %{})
      assert eq(on_hand(c.lot.id), 66)
    end
  end

  describe "gap 11: order totals per pack name" do
    test "sacks and boxes are never one number", c do
      order!(c, [
        %{"offer_id" => c.offer.id, "packs_ordered" => 30},
        %{"offer_id" => c.bsg_hop.id, "packs_ordered" => 6}
      ])

      order!(c, [%{"offer_id" => c.bsg_hop.id, "packs_ordered" => 1}])

      {200, %{"data" => t}} = req(c.brewer, :get, "/api/ingredient_totals/orders")

      assert t["total"]["by_pack"] == [
               %{"pack_name" => "box", "packs" => 7, "packs_ordered" => 7, "packs_received" => 0},
               %{
                 "pack_name" => "sack",
                 "packs" => 30,
                 "packs_ordered" => 30,
                 "packs_received" => 0
               }
             ]

      assert [
               %{
                 "supplier" => "BSG",
                 "by_pack" => [%{"pack_name" => "box"}, %{"pack_name" => "sack"}]
               }
             ] =
               t["by_supplier"]
    end
  end

  describe "gap 4: inventory totals rows" do
    test "carry the form and the top-level category's key", c do
      hop_lot!(c.hop_product, Date.add(Tasks.today(), -3), "3.5", "12")
      stocked_lot!(c.product, Date.add(Tasks.today(), -3), "110")

      {200, %{"data" => %{"rows" => [two_row, citra]}}} =
        req(c.brewer, :get, "/api/ingredient_totals/inventory")

      assert two_row["category_key"] == "grains" and two_row["category_id"] == c.base.id and
               two_row["form"] == nil and two_row["pack_name"] == "sack"

      assert citra["category_key"] == "hops" and citra["form"] == "T90 Pellet" and
               citra["pack_name"] == "box" and eq(citra["packs"], "0.32")
    end
  end

  describe "gap 1: the duplicate product" do
    test "is a base sentence (grain keeps D60's)", c do
      assert base(
               req(c.brewer, :post, "/api/ingredient_products", %{
                 "ingredient_id" => c.two_row.id,
                 "manufacturer_party_id" => c.rahr.id
               })
             ) == "This maltster already has that product for this grain."

      assert base(
               req(c.brewer, :post, "/api/ingredient_products", %{
                 "ingredient_id" => c.citra.id,
                 "manufacturer_party_id" => c.ych.id,
                 "form" => "T90 Pellet"
               })
             ) == "Yakima Chief Hops already has T90 Pellet Citra."
    end
  end

  describe "Hops has no subcategories" do
    test "a child of Hops is refused; a child of Grains is fine", c do
      assert %{"parent_id" => ["Hops has no subcategories"]} =
               errors(
                 req(c.p["owner"], :post, "/api/ingredient_categories", %{
                   "name" => "Noble",
                   "parent_id" => c.hops.id
                 })
               )

      other = keyed_category!("Fruits", "fruits")

      {201, %{"data" => top}} =
        req(c.p["owner"], :post, "/api/ingredient_categories", %{"name" => "Aroma"})

      assert %{"parent_id" => ["Hops has no subcategories"]} =
               errors(
                 req(c.p["owner"], :patch, "/api/ingredient_categories/#{top["id"]}", %{
                   "parent_id" => c.hops.id
                 })
               )

      assert {201, _} =
               req(c.p["owner"], :post, "/api/ingredient_categories", %{
                 "name" => "Kilned",
                 "parent_id" => c.grains.id
               })

      assert {201, _} =
               req(c.p["owner"], :post, "/api/ingredient_categories", %{
                 "name" => "Stone fruit",
                 "parent_id" => other.id
               })
    end
  end
end
