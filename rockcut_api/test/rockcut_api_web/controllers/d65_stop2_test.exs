defmodule RockcutApiWeb.D65Stop2Test do
  @moduledoc """
  D65 Stop 2 on the API (spec §4.4, §4.5, §5 items 4–6; the salts, sugars,
  fruit and finings amendments): Brix and extract on fruit and sugar
  products and lots (`only_form`: Brix on Liquid sugars only), ions on a
  Water Salts ingredient, the pack note and per-child pack names, the
  recipe lot label, the `each` minimum, and Totals per unit and per pack
  name. Every rule has a refusal and an allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2]
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.IngredientLot
  alias RockcutApi.Ingredients.{Inventory, SupplierOffer}

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
          "initial_quantity" => "10"
        },
        extra
      )
    )
  end

  defp lot!(c, product_id, extra \\ %{}) do
    {201, %{"data" => l}} = lot(c, product_id, extra)
    l
  end

  defp value(map, key), do: map["features"][key] && Decimal.new(map["features"][key]["value"])

  describe "fruit Brix (§4.4, fruit amendment decision 2)" do
    test "a range on the product: either end blank, low above high refused, 2 decimals or over 100 refused",
         c do
      body = %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"}

      assert %{"features" => %{"brix" => ["Brix: low is above high"]}} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_products",
                   Map.put(body, "features", %{"brix" => %{"low" => "9", "high" => "6.5"}})
                 )
               )

      assert %{"features" => %{"brix" => [_]}} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_products",
                   Map.put(body, "features", %{"brix" => %{"low" => "6.55"}})
                 )
               )

      assert %{"features" => %{"brix" => ["Brix must be between 0 and 100"]}} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/ingredient_products",
                   Map.put(body, "features", %{"brix" => %{"high" => "101"}})
                 )
               )

      p = product!(c, Map.put(body, "features", %{"brix" => %{"low" => "6.5", "high" => "9"}}))

      assert p["features"]["brix"]["value"] == "6.5" and
               p["features"]["brix"]["value_high"] == "9"

      open =
        product!(
          c,
          %{body | "form" => "Whole", "unit" => "lb"}
          |> Map.put("features", %{"brix" => %{"high" => "12"}})
        )

      assert open["features"]["brix"]["value"] == nil
    end

    test "on the lot: optional, never copied, 8.55 refused, outside the range marked not refused",
         c do
      p =
        product!(c, %{
          "ingredient_id" => c.strawberry.id,
          "form" => "Purée",
          "unit" => "gal",
          "features" => %{"brix" => %{"low" => "6.5", "high" => "9"}}
        })

      bare = lot!(c, p["id"])
      assert bare["features"] == %{}

      assert %{"features" => %{"brix" => ["Brix: " <> _]}} =
               errors(lot(c, p["id"], %{"features" => %{"brix" => "8.55"}}))

      ok = lot!(c, p["id"], %{"features" => %{"brix" => "8.5"}})
      assert Decimal.eq?(value(ok, "brix"), Decimal.new("8.5")) and ok["outside_range"] == []

      high = lot!(c, p["id"], %{"features" => %{"brix" => "9.4"}})
      assert high["outside_range"] == ["brix"]
    end
  end

  describe "sugars: extract on every sugar, Brix on Liquid only (only_form)" do
    test "extract copied to the lot and editable at 2 decimals; 3 refused", c do
      dry =
        product!(c, %{
          "ingredient_id" => c.dextrose.id,
          "form" => "Dry",
          "features" => %{"extract_fgdb" => "91"}
        })

      assert Decimal.eq?(value(lot!(c, dry["id"]), "extract_fgdb"), 91)

      assert Decimal.eq?(
               value(
                 lot!(c, dry["id"], %{"features" => %{"extract_fgdb" => "81.95"}}),
                 "extract_fgdb"
               ),
               Decimal.new("81.95")
             )

      assert %{"features" => %{"extract_fgdb" => ["Extract: " <> _]}} =
               errors(lot(c, dry["id"], %{"features" => %{"extract_fgdb" => "81.955"}}))
    end

    test "a Dry lot sent a Brix is refused (create, edit, Receive); a Liquid lot takes it", c do
      dry = product!(c, %{"ingredient_id" => c.dextrose.id, "form" => "Dry"})

      liquid =
        product!(c, %{"ingredient_id" => c.molasses.id, "form" => "Liquid", "unit" => "gal"})

      assert %{"features" => %{"brix" => ["Brix is only for Liquid sugars"]}} =
               errors(lot(c, dry["id"], %{"features" => %{"brix" => "40"}}))

      dry_lot = lot!(c, dry["id"])

      assert %{"features" => %{"brix" => ["Brix is only for Liquid sugars"]}} =
               errors(
                 req(c.brewer, :put, "/api/ingredient_lots/#{dry_lot["id"]}", %{
                   "features" => %{"brix" => "40"}
                 })
               )

      assert Decimal.eq?(
               value(lot!(c, liquid["id"], %{"features" => %{"brix" => "79.5"}}), "brix"),
               Decimal.new("79.5")
             )

      # Receive into a new lot # of the Dry sugar.
      offer = offer_for!(c, dry["id"], "bag", "50")

      order = order!(c, offer.id)
      [line] = order["lines"]

      assert {422, _} =
               req(c.brewer, :post, "/api/purchase_orders/#{order["id"]}/receive", %{
                 "received_on" => today(),
                 "lines" => [
                   %{
                     "id" => line["id"],
                     "packs_received" => 1,
                     "allocations" => [
                       %{"lot_number" => "D-1", "packs" => 1, "features" => %{"brix" => "40"}}
                     ]
                   }
                 ]
               })

      refute Repo.exists?(from(l in IngredientLot, where: l.lot_number == "D-1"))
    end
  end

  defp offer_for!(c, product_id, pack, size, extra \\ %{}) do
    {201, %{"data" => o}} =
      req(
        c.brewer,
        :post,
        "/api/supplier_offers",
        Map.merge(
          %{
            "product_id" => product_id,
            "supplier_party_id" => c.bsg.id,
            "pack_name" => pack,
            "pack_size" => size
          },
          extra
        )
      )

    o = Repo.get!(SupplierOffer, o["id"])
    price!(o, "45.50")
    o
  end

  defp order!(c, offer_id, packs \\ 1) do
    {201, %{"data" => order}} =
      req(c.brewer, :post, "/api/purchase_orders", %{
        "supplier_party_id" => c.bsg.id,
        "ordered_on" => today(),
        "lines" => [%{"offer_id" => offer_id, "packs_ordered" => packs}]
      })

    order
  end

  describe "receiving into an existing lot # (§10 edges)" do
    test "a purée lot with Brix 8.5: 9.0 sent is refused, 8.5 or nothing adds to it", c do
      p = product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})

      lot!(c, p["id"], %{
        "lot_number" => "P-1",
        "pack_name" => "pail",
        "pack_size" => "5",
        "features" => %{"brix" => "8.5"}
      })

      offer = offer_for!(c, p["id"], "pail", "5")

      receive = fn features ->
        order = order!(c, offer.id)
        [line] = order["lines"]
        alloc = Map.merge(%{"lot_number" => "P-1", "packs" => 1}, features)

        req(c.brewer, :post, "/api/purchase_orders/#{order["id"]}/receive", %{
          "received_on" => today(),
          "lines" => [%{"id" => line["id"], "packs_received" => 1, "allocations" => [alloc]}]
        })
      end

      assert base(receive.(%{"features" => %{"brix" => "9.0"}})) =~ "already exists"
      assert {200, _} = receive.(%{"features" => %{"brix" => "8.5"}})
      assert {200, _} = receive.(%{})
    end
  end

  describe "ions on a Water Salts ingredient (salts amendment)" do
    test "set, read and cleared on a salt; refused on any other ingredient, a non-ion, 2 decimals or over 1,000",
         c do
      put = &req(c.brewer, :put, "/api/ingredients/#{&1.id}/ions", %{"ions" => &2})

      assert {200, %{"data" => ions}} =
               put.(c.gypsum, %{"ca_ppm_per_g_gal" => "61.5", "so4_ppm_per_g_gal" => "147.4"})

      assert ions == %{"ca_ppm_per_g_gal" => "61.5", "so4_ppm_per_g_gal" => "147.4"}

      assert {200, %{"data" => %{"ca_ppm_per_g_gal" => "61.5"}}} =
               req(c.brewer, :get, "/api/ingredients/#{c.gypsum.id}/ions")

      assert %{"ions" => ["Only a Water Salts ingredient has ion values"]} =
               errors(put.(c.strawberry, %{"ca_ppm_per_g_gal" => "1"}))

      assert %{"ions" => %{"ph" => ["ph is not an ion"]}} = errors(put.(c.gypsum, %{"ph" => "7"}))

      assert %{"ions" => %{"ca_ppm_per_g_gal" => ["Calcium: " <> _]}} =
               errors(put.(c.gypsum, %{"ca_ppm_per_g_gal" => "61.55"}))

      assert %{"ions" => %{"cl_ppm_per_g_gal" => ["Chloride must be between 0 and 1,000"]}} =
               errors(put.(c.gypsum, %{"cl_ppm_per_g_gal" => "1000.1"}))

      # Read-only on the product and in the ingredient JSON.
      p = product!(c, %{"ingredient_id" => c.gypsum.id, "form" => "Powder"})
      assert p["ions"] == %{"ca_ppm_per_g_gal" => "61.5", "so4_ppm_per_g_gal" => "147.4"}
      {200, %{"data" => ing}} = req(c.brewer, :get, "/api/ingredients/#{c.gypsum.id}")
      assert ing["ions"]["so4_ppm_per_g_gal"] == "147.4"

      assert {200, %{"data" => %{"ca_ppm_per_g_gal" => "61.5"}}} =
               put.(c.gypsum, %{"so4_ppm_per_g_gal" => nil})
    end
  end

  describe "offers: the pack note and the child's pack names" do
    test "a note of at most 40 characters, in the offer and order JSON", c do
      wf =
        product!(c, %{
          "ingredient_id" => c.whirlfloc.id,
          "form" => "Tablet",
          "unit" => "each",
          "name" => "T"
        })

      body = %{
        "product_id" => wf["id"],
        "supplier_party_id" => c.bsg.id,
        "pack_name" => "tub",
        "pack_size" => "872"
      }

      assert %{"pack_note" => [_]} =
               errors(
                 req(
                   c.brewer,
                   :post,
                   "/api/supplier_offers",
                   Map.put(body, "pack_note", String.duplicate("x", 41))
                 )
               )

      {201, %{"data" => o}} =
        req(c.brewer, :post, "/api/supplier_offers", Map.put(body, "pack_note", "5 lb"))

      assert o["pack_note"] == "5 lb"
      price!(Repo.get!(SupplierOffer, o["id"]), "92.00")
      order = order!(c, o["id"])
      assert hd(order["lines"])["offer"]["pack_note"] == "5 lb"
    end

    test "Water Salts takes bag, pail, tub; Finings jug, bottle, bag, tub; another child the union",
         c do
      salt = product!(c, %{"ingredient_id" => c.gypsum.id, "form" => "Powder"})

      fining =
        product!(c, %{"ingredient_id" => c.whirlfloc.id, "form" => "Liquid", "unit" => "fl oz"})

      offer =
        &req(c.brewer, :post, "/api/supplier_offers", %{
          "product_id" => &1["id"],
          "supplier_party_id" => c.bsg.id,
          "pack_name" => &2,
          "pack_size" => "50"
        })

      assert %{"pack_name" => ["must be bag or pail or tub"]} = errors(offer.(salt, "jug"))
      assert {201, _} = offer.(salt, "pail")
      assert {201, _} = offer.(fining, "jug")
      assert %{"pack_name" => [_]} = errors(offer.(fining, "pail"))

      other =
        Repo.insert!(%RockcutApi.Brewing.IngredientCategory{
          name: "Cleaning",
          parent_id: c.consumables.id
        })

      gel = Repo.insert!(%RockcutApi.Brewing.Ingredient{name: "Gelatin", category_id: other.id})
      g = product!(c, %{"ingredient_id" => gel.id, "form" => "Powder", "unit" => "lb"})
      assert {201, _} = offer.(g, "jug")
      assert {201, _} = offer.(g, "pail")
    end
  end

  describe "the recipe lot label (A11)" do
    test "Brix only when the lot has it; grain lots unchanged", c do
      p =
        product!(c, %{
          "ingredient_id" => c.strawberry.id,
          "form" => "Purée",
          "unit" => "gal",
          "manufacturer_party_id" => c.oregon.id
        })

      with_brix = lot!(c, p["id"], %{"lot_number" => "S-1", "features" => %{"brix" => "8.5"}})
      without = lot!(c, p["id"], %{"lot_number" => "S-2"})

      assert with_brix["label"] == "Oregon Fruit Strawberry Purée · S-1 · 8.5 °Bx"
      assert without["label"] == "Oregon Fruit Strawberry Purée · S-2"

      grain = Inventory.get_lot!(stocked_lot!(c.product, Tasks.today(), 55).id)
      assert Inventory.lot_label(grain) == nil
    end
  end

  describe "each below 1 (Stop 1 LEAD note 10)" do
    test "says at least 1 tablet, or at least 1; never 0.01", c do
      wf =
        product!(c, %{
          "ingredient_id" => c.whirlfloc.id,
          "form" => "Tablet",
          "unit" => "each",
          "name" => "T"
        })

      liquid =
        product!(c, %{"ingredient_id" => c.whirlfloc.id, "form" => "Liquid", "unit" => "each"})

      for q <- ["0", "0.5"] do
        assert base(lot(c, wf["id"], %{"initial_quantity" => q})) ==
                 "Enter a quantity of at least 1 tablet and under 1,000,000 tablets"

        assert base(lot(c, liquid["id"], %{"initial_quantity" => q})) ==
                 "Enter a quantity of at least 1 and under 1,000,000"
      end

      l = lot!(c, wf["id"], %{"initial_quantity" => "5"})

      assert base(
               req(c.brewer, :post, "/api/inventory_movements", %{
                 "kind" => "used",
                 "lot_id" => l["id"],
                 "quantity" => "0",
                 "occurred_on" => today()
               })
             ) ==
               "Enter a quantity of at least 1 tablet and under 1,000,000 tablets"

      assert {201, _} =
               req(c.brewer, :post, "/api/inventory_movements", %{
                 "kind" => "used",
                 "lot_id" => l["id"],
                 "quantity" => "1",
                 "occurred_on" => today()
               })
    end
  end

  describe "inventory_on_hand over the API (§10 fruit)" do
    test "a product's on hand with its unit; an ingredient with products in two units is refused",
         c do
      puree =
        product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})

      product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Whole", "unit" => "lb"})
      lot!(c, puree["id"], %{"initial_quantity" => "11.5"})

      call = fn args ->
        {200, %{"results" => [r]}} =
          req(c.brewer, :post, "/api/formulas/execute", %{
            "calls" => [%{"function" => "inventory_on_hand", "args" => args}]
          })

        r
      end

      assert %{"status" => "ok", "value" => 11.5, "unit" => "gal"} =
               call.(%{"product_id" => puree["id"]})

      assert %{
               "status" => "error",
               "message" => "Strawberry's products are in different units; ask for one product."
             } =
               call.(%{"ingredient_id" => c.strawberry.id})
    end
  end

  describe "Totals (§4.5)" do
    test "inventory: one subtotal per unit, never added; one $ total. Orders: per pack name and per unit",
         c do
      puree =
        product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée", "unit" => "gal"})

      wf =
        product!(c, %{
          "ingredient_id" => c.whirlfloc.id,
          "form" => "Tablet",
          "unit" => "each",
          "name" => "T"
        })

      cin = product!(c, %{"ingredient_id" => c.cinnamon.id, "form" => "Ground", "unit" => "oz"})
      lot!(c, puree["id"], %{"initial_quantity" => "11.5"})
      lot!(c, wf["id"], %{"initial_quantity" => "1272"})
      lot!(c, cin["id"], %{"initial_quantity" => "16"})
      stocked_lot!(c.product, Tasks.today(), 110)

      {200, %{"data" => totals}} = req(c.owner, :get, "/api/ingredient_totals/inventory")
      by_unit = Map.new(totals["total"]["by_unit"], &{&1["unit"], Decimal.new(&1["quantity"])})
      assert Decimal.eq?(by_unit["gal"], Decimal.new("11.5"))
      assert Decimal.eq?(by_unit["each"], 1272)
      assert Decimal.eq?(by_unit["oz"], 16)
      assert Decimal.eq?(by_unit["lb"], 110)
      assert is_binary(totals["total"]["value"]) or is_nil(totals["total"]["value"])

      pail = offer_for!(c, puree["id"], "pail", "5")
      tub = offer_for!(c, wf["id"], "tub", "872")

      {201, _} =
        req(c.brewer, :post, "/api/purchase_orders", %{
          "supplier_party_id" => c.bsg.id,
          "ordered_on" => today(),
          "lines" => [
            %{"offer_id" => pail.id, "packs_ordered" => 2},
            %{"offer_id" => tub.id, "packs_ordered" => 1}
          ]
        })

      {200, %{"data" => orders}} = req(c.owner, :get, "/api/ingredient_totals/orders")
      packs = Map.new(orders["total"]["by_pack"], &{&1["pack_name"], &1["packs_ordered"]})
      assert packs == %{"pail" => 2, "tub" => 1}
      units = Map.new(orders["total"]["by_unit"], &{&1["unit"], Decimal.new(&1["quantity"])})
      assert Decimal.eq?(units["gal"], 10) and Decimal.eq?(units["each"], 872)
      tub_row = Enum.find(orders["rows"], &(&1["pack_name"] == "tub"))
      assert tub_row["unit_label"] == "tablets"
    end
  end
end
