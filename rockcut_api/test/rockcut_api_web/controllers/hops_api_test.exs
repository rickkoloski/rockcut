defmodule RockcutApiWeb.HopsApiTest do
  @moduledoc """
  D62 Stage 2: hops on the product model (spec §3.1, §3.4, §3.6, §3.7,
  §4.8, A1, A2, A5). Each rule has a refusal and an allowed case: hop
  products (form, unit, origin, ranges, the duplicate), 11 lb box offers,
  hop lots (crop year, alpha, the box, ranges not copied, outside-range
  marks, the recipe label), Oldest first, a mixed BSG order and receiving
  into a new hop lot, hop contract lines in lb, and `est_ibu` on a hop lot
  made the new way.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing
  alias RockcutApi.Brewing.{Ingredient, IngredientLot}
  alias RockcutApi.Formulas.FormulaRuntime
  alias RockcutApi.Ingredients.{OfferPrice, Product, SupplierOffer}

  setup do
    p = personas(~w(owner brewer1 brewer2 breweryMgr))
    c = grain_catalog!()
    c = Map.merge(c, hop_catalog!(c))
    Repo.update!(Ecto.Changeset.change(c.bsg, order_target_packs: 40))
    price!(c.offer, "48.50")

    bsg_hop =
      Repo.insert!(%SupplierOffer{
        product_id: c.hop_product.id,
        supplier_party_id: c.bsg.id,
        pack_name: "box",
        pack_size: Decimal.new(11),
        form: "whole"
      })

    price!(bsg_hop, "165.00")

    Map.merge(c, %{
      p: p,
      brewer: p["brewer1"],
      mgr: p["breweryMgr"],
      bsg_hop: bsg_hop,
      this: Tasks.today().year,
      next: Tasks.today().year + 1
    })
  end

  defp iso(offset), do: Date.to_iso8601(Date.add(Tasks.today(), offset))

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message

  defp eq(a, b), do: Decimal.eq?(Decimal.new(to_string(a)), Decimal.new(to_string(b)))

  defp product_body(c, extra) do
    Map.merge(
      %{
        "ingredient_id" => c.citra.id,
        "manufacturer_party_id" => c.ych.id,
        "form" => "Cryo",
        "origin" => "USA"
      },
      extra
    )
  end

  defp lot_body(c, extra) do
    Map.merge(
      %{
        "product_id" => c.hop_product.id,
        "supplier_party_id" => c.bsg.id,
        "lot_number" => "H-1",
        "received_date" => iso(-1),
        "crop_year" => 2025,
        "initial_kind" => "opening",
        "initial_quantity" => "44",
        "features" => %{"alpha_acid_pct" => "14.1"}
      },
      extra
    )
  end

  defp range(low, high), do: %{"low" => low, "high" => high}

  describe "hop products (§3.3, §3.6)" do
    test "a form from the list is required; the API sets the unit; origin is optional", c do
      assert %{"form" => ["can't be blank"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_products",
                   product_body(c, %{"form" => nil})
                 )
               )

      assert %{"form" => ["must be one of T90 Pellet, Cryo, Whole leaf, Extract"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_products",
                   product_body(c, %{"form" => "Pellet"})
                 )
               )

      assert %{"origin" => [_]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_products",
                   product_body(c, %{"origin" => String.duplicate("x", 101)})
                 )
               )

      {201, %{"data" => p}} =
        req(c.brewer, :post, "/api/ingredient_products", product_body(c, %{"unit" => "gal"}))

      assert p["form"] == "Cryo" and p["unit"] == "lb" and p["origin"] == "USA"
      assert p["category_key"] == "hops"
      assert p["display_name"] == "Yakima Chief Hops Citra Cryo"

      {201, %{"data" => named}} =
        req(
          c.brewer,
          :post,
          "/api/ingredient_products",
          product_body(c, %{"form" => "T90 Pellet", "name" => "Lupomax", "origin" => ""})
        )

      assert named["display_name"] == "Yakima Chief Hops Citra T90 Pellet (Lupomax)"
      assert named["origin"] == nil
    end

    test "a grain product takes no form", c do
      body = %{"ingredient_id" => c.two_row.id, "manufacturer_party_id" => c.root_shoot.id}

      assert %{"form" => ["isn't set on this category's products"]} =
               errors(
                 req(c.brewer, :post, "/api/ingredient_products", Map.put(body, "form", "Cryo"))
               )

      assert {201, %{"data" => %{"form" => nil, "unit" => "lb"}}} =
               req(c.brewer, :post, "/api/ingredient_products", body)
    end

    test "manufacturer + variety + form + name is unique; another manufacturer or form is another product",
         c do
      dup = product_body(c, %{"form" => "T90 Pellet"})

      assert %{"ingredient_id" => ["This manufacturer already has that hop in that form."]} =
               errors(req(c.brewer, :post, "/api/ingredient_products", dup))

      hopsteiner = party!("Hopsteiner", ~w(manufacturer))

      assert {201, _} =
               req(
                 c.brewer,
                 :post,
                 "/api/ingredient_products",
                 Map.put(dup, "manufacturer_party_id", hopsteiner.id)
               )

      assert {201, _} = req(c.brewer, :post, "/api/ingredient_products", product_body(c, %{}))
    end

    test "typical alpha, beta and oil are ranges: low ≤ high, either end blank, in range, 2 decimals",
         c do
      post = fn features ->
        req(
          c.brewer,
          :post,
          "/api/ingredient_products",
          product_body(c, %{"features" => features})
        )
      end

      assert %{"features" => %{"alpha_acid_pct" => ["Alpha acid: low is above high"]}} =
               errors(post.(%{"alpha_acid_pct" => range("13", "11")}))

      assert %{"features" => %{"alpha_acid_pct" => ["Alpha acid: Use at most 2 decimals"]}} =
               errors(post.(%{"alpha_acid_pct" => range("11.125", "13")}))

      assert %{"features" => %{"total_oil_ml_100g" => ["Total oil must be between 0 and 10"]}} =
               errors(post.(%{"total_oil_ml_100g" => range("2.5", "10.5")}))

      assert %{"features" => %{"beta_acid_pct" => ["Beta acid is a range: give low and high"]}} =
               errors(post.(%{"beta_acid_pct" => "4"}))

      {201, %{"data" => p}} =
        post.(%{
          "alpha_acid_pct" => range("11", "12.67"),
          "beta_acid_pct" => range("", "4.5"),
          "total_oil_ml_100g" => range("2.5", nil)
        })

      assert eq(p["features"]["alpha_acid_pct"]["value"], "11")
      assert eq(p["features"]["alpha_acid_pct"]["value_high"], "12.67")
      assert p["features"]["beta_acid_pct"]["value"] == nil
      assert eq(p["features"]["beta_acid_pct"]["value_high"], "4.5")
      assert p["features"]["total_oil_ml_100g"]["value_high"] == nil

      # Both ends blank: no range.
      {200, %{"data" => p}} =
        req(c.brewer, :patch, "/api/ingredient_products/#{p["id"]}", %{
          "features" => %{"beta_acid_pct" => range("", "")}
        })

      refute Map.has_key?(p["features"], "beta_acid_pct")
      assert Map.has_key?(p["features"], "alpha_acid_pct")
    end

    test "feature types: alpha and beta keep 2 decimals; hops' rows say range on the product, entered on the lot",
         c do
      {200, %{"data" => types}} = req(c.brewer, :get, "/api/feature_types")
      by_key = Map.new(types, &{&1["key"], &1})

      assert by_key["alpha_acid_pct"]["decimals"] == 2
      assert by_key["beta_acid_pct"]["decimals"] == 2
      assert by_key["total_oil_ml_100g"]["unit_label"] == "mL/100 g"

      assert [%{"product_mode" => "range", "lot_mode" => "enter", "lot_required" => true}] =
               by_key["alpha_acid_pct"]["categories"]

      assert [%{"lot_required" => false}] = by_key["beta_acid_pct"]["categories"]

      assert Enum.all?(
               by_key["extract_fgdb"]["categories"],
               &(&1["product_mode"] == "value" and &1["lot_mode"] == "copy")
             )
    end
  end

  describe "hop offers (§3.5, decision 6)" do
    test "always box · 11 lb: set when omitted, anything else refused", c do
      body = %{"product_id" => c.hop_product.id, "supplier_party_id" => c.root_shoot.id}

      for bad <- [
            %{"pack_name" => "sack"},
            %{"pack_size" => "22"},
            %{"pack_name" => "box", "pack_size" => "44"}
          ] do
        assert base(req(c.brewer, :post, "/api/supplier_offers", Map.merge(body, bad))) ==
                 "Hop offers are 11 lb boxes"
      end

      {201, %{"data" => o}} = req(c.brewer, :post, "/api/supplier_offers", body)
      assert o["pack_name"] == "box" and eq(o["pack_size"], 11)

      assert {201, _} =
               req(
                 c.brewer,
                 :post,
                 "/api/supplier_offers",
                 Map.merge(body, %{
                   "pack_name" => "box",
                   "pack_size" => "11.0",
                   "order_name" => "x"
                 })
               )

      assert base(
               req(c.brewer, :patch, "/api/supplier_offers/#{o["id"]}", %{"pack_size" => "22"})
             ) ==
               "Hop offers are 11 lb boxes"
    end

    test "a grain offer stays in sacks; a box price shows its $/lb", c do
      assert %{"pack_name" => ["must be sack"]} =
               errors(
                 req(c.brewer, :post, "/api/supplier_offers", %{
                   "product_id" => c.product.id,
                   "supplier_party_id" => c.root_shoot.id,
                   "pack_name" => "box",
                   "pack_size" => "55"
                 })
               )

      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{c.hop_product.id}")
      bsg = Enum.find(p["offers"], &(&1["id"] == c.bsg_hop.id))
      assert eq(bsg["current_price"]["price_per_pack"], "165.00")
      assert eq(bsg["current_price"]["price_per_unit"], "15")
    end
  end

  describe "hop lots (§3.4, A2)" do
    test "crop year 2000 through next year and alpha are required; beta and oil aren't", c do
      post = fn extra ->
        req(c.p["brewer2"], :post, "/api/ingredient_lots", lot_body(c, extra))
      end

      assert %{"crop_year" => ["can't be blank"]} = errors(post.(%{"crop_year" => nil}))

      assert %{"crop_year" => ["must be a year from 2000 to " <> _]} =
               errors(post.(%{"crop_year" => 1999}))

      assert %{"crop_year" => [_]} = errors(post.(%{"crop_year" => c.next + 1}))

      assert %{"features" => %{"alpha_acid_pct" => ["Alpha acid can't be blank"]}} =
               errors(post.(%{"features" => %{"beta_acid_pct" => "4"}}))

      assert %{"features" => %{"alpha_acid_pct" => ["Alpha acid: Use at most 2 decimals"]}} =
               errors(post.(%{"features" => %{"alpha_acid_pct" => "14.125"}}))

      assert {201, %{"data" => %{"crop_year" => year}}} =
               post.(%{"crop_year" => c.next, "lot_number" => "H-NEXT"})

      assert year == c.next
    end

    test "a hop lot needs its product, is in 11 lb boxes, and only hop lots have a crop year",
         c do
      assert %{"product_id" => ["A lot needs its product"]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_lots",
                   lot_body(c, %{"product_id" => nil, "ingredient_id" => c.citra.id})
                 )
               )

      assert base(
               req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{"pack_name" => "sack"}))
             ) ==
               "Hop lots are 11 lb boxes"

      assert base(
               req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{"pack_size" => "22"}))
             ) ==
               "Hop lots are 11 lb boxes"

      assert %{"crop_year" => ["Only hop lots have a crop year"]} =
               errors(
                 req(c.brewer, :post, "/api/ingredient_lots", %{
                   "product_id" => c.product.id,
                   "received_date" => iso(-1),
                   "pack_size" => "55",
                   "crop_year" => 2025,
                   "initial_kind" => "opening",
                   "initial_quantity" => "55"
                 })
               )
    end

    test "the range isn't copied; a value outside it is kept and marked; 4 boxes are 44 lb", c do
      {201, %{"data" => lot}} =
        req(c.p["brewer2"], :post, "/api/ingredient_lots", lot_body(c, %{}))

      assert lot["pack_name"] == "box" and eq(lot["pack_size"], 11)
      assert eq(lot["on_hand"], 44)
      assert eq(lot["features"]["alpha_acid_pct"]["value"], "14.1")
      assert Map.keys(lot["features"]) == ["alpha_acid_pct"]
      assert lot["outside_range"] == ["alpha_acid_pct"]

      {200, %{"data" => lot}} =
        req(c.brewer, :patch, "/api/ingredient_lots/#{lot["id"]}", %{
          "features" => %{"alpha_acid_pct" => "12.4", "beta_acid_pct" => "5"}
        })

      assert lot["outside_range"] == ["beta_acid_pct"]
      assert lot["label"] == "Yakima Chief Hops Citra T90 Pellet · H-1 · 2025 · 12.4% AA"
    end

    test "editing: the crop year and alpha can change but can't be removed", c do
      {201, %{"data" => %{"id" => id}}} =
        req(c.brewer, :post, "/api/ingredient_lots", lot_body(c, %{}))

      path = "/api/ingredient_lots/#{id}"

      assert %{"crop_year" => ["can't be blank"]} =
               errors(req(c.brewer, :patch, path, %{"crop_year" => ""}))

      assert %{"features" => %{"alpha_acid_pct" => ["Alpha acid can't be blank"]}} =
               errors(req(c.brewer, :patch, path, %{"features" => %{"alpha_acid_pct" => nil}}))

      assert base(req(c.brewer, :patch, path, %{"pack_size" => "22"})) ==
               "Hop lots are 11 lb boxes"

      {200, %{"data" => lot}} =
        req(c.brewer, :patch, path, %{"crop_year" => 2024, "notes" => "re-sheet"})

      assert lot["crop_year"] == 2024
      assert eq(lot["features"]["alpha_acid_pct"]["value"], "14.1")
    end

    test "Used in brewing, Oldest first, across two lots in lb", c do
      older = hop_lot!(c.hop_product, Date.add(Tasks.today(), -30), "4", "12.0", "OLD")
      newer = hop_lot!(c.hop_product, Date.add(Tasks.today(), -3), "44", "12.5", "NEW")

      {201, %{"data" => moves}} =
        req(c.brewer, :post, "/api/inventory_movements", %{
          "kind" => "used",
          "quantity" => "6.5",
          "occurred_on" => iso(0),
          "product_id" => c.hop_product.id,
          "allocation" => "oldest_first"
        })

      assert Enum.map(moves, &{&1["lot_id"], &1["quantity"]}) == [
               {older.id, "-4"},
               {newer.id, "-2.5"}
             ]

      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{c.hop_product.id}")
      assert eq(p["on_hand"], "41.5")

      # A refusal reads in boxes (the person's default display).
      assert base(
               req(c.brewer, :post, "/api/inventory_movements", %{
                 "kind" => "used",
                 "quantity" => "50",
                 "occurred_on" => iso(0),
                 "product_id" => c.hop_product.id,
                 "allocation" => "oldest_first"
               })
             ) == "That's more than the 3 boxes 8.5 lb on hand"
    end
  end

  describe "a mixed BSG order (A5) and receiving hops" do
    setup c do
      {201, %{"data" => order}} =
        req(c.brewer, :post, "/api/purchase_orders", %{
          "supplier_party_id" => c.bsg.id,
          "ordered_on" => iso(0),
          "lines" => [
            %{"offer_id" => c.offer.id, "packs_ordered" => 30},
            %{"offer_id" => c.bsg_hop.id, "packs_ordered" => 6}
          ]
        })

      %{order: order}
    end

    test "every pack counts toward the target: 36 of 40", %{order: order} do
      assert order["total_packs"] == 36
      assert order["target"] == %{"packs" => 40, "next_multiple" => 40}
      assert Enum.any?(order["by_unit"], &(&1["unit"] == "lb"))
    end

    test "a new hop lot on receive needs its crop year and alpha", c do
      [grain, hop] = c.order["lines"]
      path = "/api/purchase_orders/#{c.order["id"]}/receive"

      body = fn alloc ->
        %{
          "lines" => [
            %{
              "id" => grain["id"],
              "packs_received" => 30,
              "allocations" => [%{"lot_number" => "G-1", "packs" => 30}]
            },
            %{
              "id" => hop["id"],
              "packs_received" => 6,
              "allocations" => [Map.merge(%{"lot_number" => "C-1", "packs" => 6}, alloc)]
            }
          ]
        }
      end

      assert base(req(c.brewer, :post, path, body.(%{"features" => %{"alpha_acid_pct" => "12"}}))) ==
               "Yakima Chief Hops Citra T90 Pellet lot C-1: enter its crop year"

      assert base(req(c.brewer, :post, path, body.(%{"crop_year" => 2025}))) ==
               "Yakima Chief Hops Citra T90 Pellet lot C-1: Alpha acid can't be blank"

      assert base(
               req(
                 c.brewer,
                 :post,
                 path,
                 body.(%{"crop_year" => 1990, "features" => %{"alpha_acid_pct" => "12"}})
               )
             ) =~
               "Yakima Chief Hops Citra T90 Pellet lot C-1: the crop year must be a year from 2000"

      assert {200, %{"data" => %{"status" => "received"}}} =
               req(
                 c.brewer,
                 :post,
                 path,
                 body.(%{"crop_year" => 2025, "features" => %{"alpha_acid_pct" => "12.25"}})
               )

      lot = Repo.get_by!(IngredientLot, product_id: c.hop_product.id, lot_number: "C-1")
      assert lot.crop_year == 2025 and lot.pack_name == "box" and Decimal.eq?(lot.pack_size, 11)

      {200, %{"data" => lot}} = req(c.brewer, :get, "/api/ingredient_lots/#{lot.id}")
      assert eq(lot["on_hand"], 66) and lot["outside_range"] == []

      # A grain lot received alongside takes no crop year.
      assert Repo.get_by!(IngredientLot, lot_number: "G-1").crop_year == nil
    end
  end

  describe "hop contract lines (§3.7, A1)" do
    defp contract_body(c, year, lines),
      do: %{"supplier_party_id" => c.bsg.id, "year" => year, "lines" => lines}

    test "only grain and hops go on a contract", c do
      fruits = keyed_category!("Fruits", "fruits")
      strawberry = Repo.insert!(%Ingredient{name: "Strawberry", category_id: fruits.id})

      puree =
        Repo.insert!(%Product{
          ingredient_id: strawberry.id,
          manufacturer_party_id: c.rahr.id,
          unit: "gal"
        })

      offer!(puree, c.bsg, "5")

      assert base(
               req(
                 c.mgr,
                 :post,
                 "/api/contracts",
                 contract_body(c, c.next, [
                   %{"product_id" => puree.id, "quantity" => 4, "price" => "60"}
                 ])
               )
             ) == "Contracts are for grain and hops"

      assert {201, _} =
               req(
                 c.mgr,
                 :post,
                 "/api/contracts",
                 contract_body(c, c.next, [
                   %{"product_id" => c.hop_product.id, "quantity" => "440", "price" => "14.50"}
                 ])
               )
    end

    test "a hop line in lb at $/lb writes $/box = × 11 from Jan 1; a grain line stays whole sacks",
         c do
      assert %{"quantity" => ["Use a whole number"]} =
               errors(
                 req(
                   c.mgr,
                   :post,
                   "/api/contracts",
                   contract_body(c, c.next, [
                     %{"product_id" => c.product.id, "quantity" => "40.5", "price" => "42"}
                   ])
                 )
               )

      assert %{"quantity" => ["Use at most 2 decimals"]} =
               errors(
                 req(
                   c.mgr,
                   :post,
                   "/api/contracts",
                   contract_body(c, c.next, [
                     %{
                       "product_id" => c.hop_product.id,
                       "quantity" => "440.125",
                       "price" => "14.5"
                     }
                   ])
                 )
               )

      {201, %{"data" => contract}} =
        req(
          c.mgr,
          :post,
          "/api/contracts",
          contract_body(c, c.next, [
            %{"product_id" => c.product.id, "quantity" => 40, "price" => "42.00"},
            %{"product_id" => c.hop_product.id, "quantity" => "440.5", "price" => "14.50"}
          ])
        )

      [grain, hop] = contract["lines"]
      assert grain["quantity"] == 40 and grain["contract_unit"] == "packs"
      # Lead note 4: 440.5 lb round-trips.
      assert hop["quantity"] == 440.5 and hop["contract_unit"] == "lb" and hop["unit"] == "lb"
      assert hop["contracted"] == 440.5 and eq(hop["contracted_dollars"], "6387.25")
      assert contract["remaining"] == 40 and contract["remaining_lb"] == 440.5

      [row] =
        Repo.all(
          from(p in OfferPrice,
            where: p.offer_id == ^c.bsg_hop.id and p.note == ^"Contract #{c.next}"
          )
        )

      assert Decimal.eq?(row.price_per_pack, "159.50")
      assert row.effective_on == Date.new!(c.next, 1, 1)

      assert {403, _} =
               req(c.brewer, :put, "/api/contracts/#{contract["id"]}", %{"notes" => "x"})
    end

    test "a past year writes no price row", c do
      {201, _} =
        req(
          c.mgr,
          :post,
          "/api/contracts",
          contract_body(c, c.this - 1, [
            %{"product_id" => c.hop_product.id, "quantity" => "220", "price" => "14.50"}
          ])
        )

      assert Repo.all(from(p in OfferPrice, where: p.offer_id == ^c.bsg_hop.id)) |> length() == 1
    end

    test "received, remaining and the shortfall by weight in lb", c do
      {201, %{"data" => contract}} =
        req(
          c.mgr,
          :post,
          "/api/contracts",
          contract_body(c, c.this, [
            %{"product_id" => c.hop_product.id, "quantity" => "440", "price" => "14.50"}
          ])
        )

      {201, %{"data" => order}} =
        req(c.brewer, :post, "/api/purchase_orders", %{
          "supplier_party_id" => c.bsg.id,
          "ordered_on" => iso(0),
          "lines" => [%{"offer_id" => c.bsg_hop.id, "packs_ordered" => 10}]
        })

      {200, %{"data" => %{"lines" => [line]}}} =
        req(c.brewer, :get, "/api/contracts/#{contract["id"]}")

      assert line["on_order"] == 110

      [ol] = order["lines"]

      {200, _} =
        req(c.brewer, :post, "/api/purchase_orders/#{order["id"]}/receive", %{
          "lines" => [
            %{
              "id" => ol["id"],
              "packs_received" => 10,
              "allocations" => [
                %{
                  "lot_number" => "K-1",
                  "packs" => 10,
                  "crop_year" => 2025,
                  "features" => %{"alpha_acid_pct" => "12.4"}
                }
              ]
            }
          ]
        })

      {200, %{"data" => data}} = req(c.brewer, :get, "/api/contracts/#{contract["id"]}")
      [line] = data["lines"]
      assert line["received"] == 110 and line["remaining"] == 330 and line["on_order"] == 0
      assert data["remaining"] == 0 and data["remaining_lb"] == 330

      {200, %{"data" => [short]}} = req(c.brewer, :get, "/api/contracts/shortfall?year=#{c.this}")

      assert short["contract_unit"] == "lb" and short["short"] == 330 and
               short["contracted"] == 440
    end
  end

  describe "est_ibu (§5)" do
    test "a hop lot made the D62 way gives the IBU of a pre-D62 lot with the same alpha", c do
      {201, %{"data" => %{"id" => new_id}}} =
        req(
          c.brewer,
          :post,
          "/api/ingredient_lots",
          lot_body(c, %{"features" => %{"alpha_acid_pct" => "12.40"}})
        )

      # Pre-D62: a lot of the hop with no product, its alpha a feature value.
      cascade = Repo.insert!(%Ingredient{name: "Old Citra", category_id: c.hops.id})
      old = Repo.insert!(%IngredientLot{ingredient_id: cascade.id, status: "available"})
      lot_features!(old, alpha_acid_pct: "12.4")

      ibu = fn lot_id ->
        {:ok, brand} = Brewing.create_brand(%{name: "IBU #{System.unique_integer([:positive])}"})

        {:ok, recipe} =
          Brewing.create_recipe(%{
            brand_id: brand.id,
            boil_time: 60,
            batch_size: "5.0",
            batch_size_unit: "gallons"
          })

        {:ok, _} =
          Brewing.create_recipe_ingredient(%{
            recipe_id: recipe.id,
            lot_id: lot_id,
            amount: "1.5",
            unit: "oz",
            use: "boil",
            time_minutes: 60
          })

        {:ok, %{value: value}} =
          FormulaRuntime.execute("est_ibu", %{"recipe_id" => recipe.id}, %{repo: Repo})

        value
      end

      assert ibu.(new_id) == ibu.(old.id)
      # The old-style lot's recipe line still works.
      assert ibu.(old.id) > 0
    end
  end
end
