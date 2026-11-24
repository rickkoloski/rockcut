defmodule RockcutApiWeb.D65Stop1Test do
  @moduledoc """
  D65 Stop 1 on the API (spec §2 decision 8, §4.1–§4.3, A9, A10; plan
  Stop 1): the Catalog lists per category and child, products with an
  optional manufacturer ("None") and their form and unit rules, the
  duplicate with no manufacturer, `display_name` and the tablets label,
  `each` in whole numbers on every write, no custom fields or children on
  Fruits, Spices & Flavorings and Sugars and Extracts, the ingredient
  formula, and no D65 product on a contract. Every rule has a refusal and an
  allowed case.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2]
  import Ecto.Query, only: [from: 2]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.IngredientLot
  alias RockcutApi.Ingredients.{Catalog, Movement, Product, Products, SupplierOffer}

  setup do
    p = personas(~w(owner brewer1 breweryMgr))
    c = Map.merge(grain_catalog!(), d65_catalog!())
    Map.merge(c, %{brewer: p["brewer1"], owner: p["owner"], mgr: p["breweryMgr"]})
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp today, do: Date.to_iso8601(Tasks.today())

  defp product(c, attrs), do: req(c.brewer, :post, "/api/ingredient_products", attrs)

  defp product!(c, attrs) do
    {201, %{"data" => p}} = product(c, attrs)
    p
  end

  defp whirlfloc!(c),
    do:
      product!(c, %{
        "ingredient_id" => c.whirlfloc.id,
        "form" => "Tablet",
        "unit" => "each",
        "name" => "T"
      })

  defp lot!(c, product_id, quantity, extra \\ %{}) do
    {201, %{"data" => lot}} =
      req(
        c.brewer,
        :post,
        "/api/ingredient_lots",
        Map.merge(
          %{
            "product_id" => product_id,
            "received_date" => today(),
            "initial_kind" => "opening",
            "initial_quantity" => quantity
          },
          extra
        )
      )

    lot
  end

  describe "Catalog (§4.2)" do
    test "forms, units and packs per category; Other Consumables per child, the union for another",
         c do
      assert Catalog.forms("fruits") == ["Purée", "Whole", "Juice / concentrate"]
      assert Catalog.units("fruits") == ["gal", "lb"]
      assert Catalog.forms("spices") == ["Whole", "Ground", "Extract"]
      assert Catalog.units("spices") == ["oz", "fl oz"]
      assert Catalog.forms("sugars") == ["Dry", "Liquid"]
      assert Catalog.form_units("sugars", nil, "Dry") == ["lb"]
      assert Catalog.form_units("sugars", nil, "Liquid") == ["lb", "gal"]
      assert Catalog.forms("consumables", c.salts) == ["Powder", "Flake"]
      assert Catalog.units("consumables", c.salts) == ["lb"]
      assert Catalog.pack_names("consumables", c.salts) == ~w(bag pail tub)
      assert Catalog.forms("consumables", c.finings) == ["Liquid", "Powder", "Tablet"]
      assert Catalog.units("consumables", c.finings) == ["fl oz", "lb", "each"]
      assert Catalog.pack_names("consumables", c.finings) == ~w(jug bottle bag tub)

      other =
        Repo.insert!(%RockcutApi.Brewing.IngredientCategory{
          name: "Cleaning",
          parent_id: c.consumables.id
        })

      assert Catalog.forms("consumables", other) == ["Powder", "Flake", "Liquid", "Tablet"]
      assert Catalog.units("consumables", other) == ["lb", "fl oz", "each"]
      assert Catalog.pack_names("consumables", other) == ~w(bag pail tub jug bottle)

      assert Catalog.pack_names("fruits") == ~w(pail drum case bag box)
      assert Catalog.pack_names("spices") == ~w(bag jar bottle case)
      assert Catalog.pack_names("sugars") == ~w(bag sack pail drum jug)

      assert Enum.map(["lb", "gal", "fl oz", "oz", "each", "kg"], &Catalog.default_pack/1) ==
               ["bag", "pail", "jug", "bag", "tub", nil]

      assert Catalog.manufacturer_required?("grains") and Catalog.manufacturer_required?("hops")

      for key <- ~w(fruits spices sugars consumables),
          do: refute(Catalog.manufacturer_required?(key))

      for key <- ~w(fruits spices sugars consumables),
          do: assert(Catalog.contract_unit(key) == nil)
    end

    test "the category JSON carries the lists; a child of Other Consumables its own", c do
      {200, %{"data" => cats}} = req(c.brewer, :get, "/api/ingredient_categories")
      by = Map.new(cats, &{&1["name"], &1["catalog"]})

      assert by["Sugars and Extracts"]["form_units"] == %{
               "Dry" => ["lb"],
               "Liquid" => ["lb", "gal"]
             }

      assert by["Water Salts"]["key"] == "consumables" and by["Water Salts"]["units"] == ["lb"]
      assert by["Finings"]["forms"] == ["Liquid", "Powder", "Tablet"]
      assert by["Fruits"]["allows_children"] == false and by["Fruits"]["allows_fields"] == false
      assert by["Other Consumables"]["allows_children"] == true
      assert by["Grains"]["manufacturer_required"] == true
      assert by["Fruits"]["manufacturer_required"] == false
    end
  end

  describe "products (§2 decision 8, §4.2)" do
    test "the manufacturer: optional on D65 products, still required on grain and hops", c do
      assert %{"manufacturer_party_id" => ["can't be blank"]} =
               errors(product(c, %{"ingredient_id" => c.two_row.id}))

      p = product!(c, %{"ingredient_id" => c.gypsum.id, "form" => "Powder"})
      assert p["manufacturer_party_id"] == nil and p["manufacturer"] == nil
      assert p["unit"] == "lb"
      assert p["display_name"] == "Calcium Sulfate (Gypsum) Powder · None"

      with_maker =
        product!(c, %{
          "ingredient_id" => c.strawberry.id,
          "manufacturer_party_id" => c.oregon.id,
          "form" => "Purée",
          "unit" => "gal"
        })

      assert with_maker["display_name"] == "Oregon Fruit Strawberry Purée"
    end

    test "a form from the category's (or child's) list is required", c do
      assert %{"form" => ["can't be blank"]} =
               errors(product(c, %{"ingredient_id" => c.strawberry.id, "unit" => "lb"}))

      assert %{"form" => ["must be one of Powder, Flake"]} =
               errors(product(c, %{"ingredient_id" => c.gypsum.id, "form" => "Tablet"}))

      assert %{"form" => ["must be one of Liquid, Powder, Tablet"]} =
               errors(
                 product(c, %{
                   "ingredient_id" => c.whirlfloc.id,
                   "form" => "Flake",
                   "unit" => "lb"
                 })
               )

      assert product!(c, %{"ingredient_id" => c.cinnamon.id, "form" => "Ground", "unit" => "oz"})[
               "unit"
             ] == "oz"
    end

    test "the unit comes from the list; sugars by form (Dry lb; Liquid lb or gal)", c do
      assert %{"unit" => ["can't be blank"]} =
               errors(product(c, %{"ingredient_id" => c.strawberry.id, "form" => "Purée"}))

      assert %{"unit" => ["must be one of oz, fl oz"]} =
               errors(
                 product(c, %{
                   "ingredient_id" => c.vanilla.id,
                   "form" => "Extract",
                   "unit" => "gal"
                 })
               )

      assert %{"unit" => ["Dry sugars are in lb"]} =
               errors(
                 product(c, %{"ingredient_id" => c.dextrose.id, "form" => "Dry", "unit" => "gal"})
               )

      assert product!(c, %{"ingredient_id" => c.dextrose.id, "form" => "Dry"})["unit"] == "lb"

      assert product!(c, %{"ingredient_id" => c.molasses.id, "form" => "Liquid", "unit" => "gal"})[
               "unit"
             ] ==
               "gal"

      assert product!(c, %{
               "ingredient_id" => c.vanilla.id,
               "form" => "Extract",
               "unit" => "fl oz"
             })["unit"] ==
               "fl oz"
    end

    test "the unit is fixed once the product has a lot", c do
      p = product!(c, %{"ingredient_id" => c.molasses.id, "form" => "Liquid", "unit" => "lb"})

      update =
        &req(
          c.brewer,
          :put,
          "/api/ingredient_products/#{p["id"]}",
          Map.put(&1, "lock_version", &2)
        )

      {200, %{"data" => p}} = update.(%{"unit" => "gal"}, p["lock_version"])
      assert p["unit"] == "gal"

      lot!(c, p["id"], "5")

      assert %{"unit" => ["This product has lots, so its unit stays gal"]} =
               errors(update.(%{"unit" => "lb"}, p["lock_version"]))

      assert {200, _} = update.(%{"notes" => "dark"}, p["lock_version"])
      assert Repo.get!(Product, p["id"]).unit == "gal"
    end

    test "a missing manufacturer is one value: a second None product is the duplicate", c do
      body = %{"ingredient_id" => c.gypsum.id, "form" => "Powder"}
      product!(c, body)

      assert base(product(c, body)) ==
               "There's already a Calcium Sulfate (Gypsum) Powder with manufacturer None."

      assert product!(c, %{body | "form" => "Flake"})["display_name"] ==
               "Calcium Sulfate (Gypsum) Flake · None"

      wf = whirlfloc!(c)

      assert base(
               product(c, %{
                 "ingredient_id" => c.whirlfloc.id,
                 "form" => "Tablet",
                 "unit" => "each",
                 "name" => "T"
               })
             ) ==
               "There's already a Whirlfloc T with manufacturer None."

      assert wf["display_name"] == "Whirlfloc T · None"
    end
  end

  describe "display_name and the unit label" do
    test "None, with and without a product name; makers as D62; tablets for a Tablet each", c do
      none = none_product!(c.gypsum, "Powder", "lb") |> Repo.preload([:ingredient, :manufacturer])

      named =
        none_product!(c.whirlfloc, "Tablet", "each", "T")
        |> Repo.preload([:ingredient, :manufacturer])

      liquid =
        none_product!(c.whirlfloc, "Liquid", "each") |> Repo.preload([:ingredient, :manufacturer])

      assert Products.display_name(none) == "Calcium Sulfate (Gypsum) Powder · None"
      assert Products.display_name(named) == "Whirlfloc T · None"
      assert Products.short_name(named) == "Whirlfloc T"
      assert Products.unit_label(named) == "tablets"
      assert Products.unit_label(liquid) == "each"
      assert Products.unit_label(none) == "lb"

      grain = Repo.preload(c.product, [:ingredient, :manufacturer])
      assert Products.display_name(grain) == "Rahr 2-Row"

      # Nothing prints "nil" or an empty maker in the JSON, lists and totals.
      lot!(c, named.id, "872")
      {200, %{"data" => list}} = req(c.brewer, :get, "/api/ingredient_products")
      names = Enum.map(list, & &1["display_name"])
      assert "Whirlfloc T · None" in names
      refute Enum.any?(names, &(is_nil(&1) or &1 =~ "nil" or String.starts_with?(&1, " ")))
      assert Enum.find(list, &(&1["id"] == named.id))["unit_label"] == "tablets"

      {200, %{"data" => %{"rows" => rows}}} =
        req(c.owner, :get, "/api/ingredient_totals/inventory")

      row = Enum.find(rows, &(&1["product_id"] == named.id))
      assert row["manufacturer"] == "None" and row["display_name"] == "Whirlfloc T · None"
      assert row["unit_label"] == "tablets"
    end
  end

  describe "each in whole numbers (§4.3)" do
    setup c do
      wf = whirlfloc!(c)

      liquid =
        product!(c, %{"ingredient_id" => c.whirlfloc.id, "form" => "Liquid", "unit" => "each"})

      Map.merge(c, %{wf: wf, liquid: liquid})
    end

    test "a lot's first movement and pack size", c do
      body = %{
        "product_id" => c.wf["id"],
        "received_date" => today(),
        "initial_kind" => "opening",
        "initial_quantity" => "2.5"
      }

      assert base(req(c.brewer, :post, "/api/ingredient_lots", body)) ==
               "Whirlfloc T is counted in whole tablets"

      assert base(
               req(c.brewer, :post, "/api/ingredient_lots", %{
                 body
                 | "product_id" => c.liquid["id"]
               })
             ) ==
               "Whirlfloc Liquid is counted in whole numbers"

      assert base(
               req(
                 c.brewer,
                 :post,
                 "/api/ingredient_lots",
                 Map.merge(body, %{"initial_quantity" => "3", "pack_size" => "872.3"})
               )
             ) == "Whirlfloc T is counted in whole tablets"

      lot = lot!(c, c.wf["id"], "872", %{"pack_name" => "tub", "pack_size" => "872"})
      assert Decimal.eq?(Decimal.new(lot["on_hand"]), 872)

      assert base(
               req(c.brewer, :put, "/api/ingredient_lots/#{lot["id"]}", %{"pack_size" => "10.5"})
             ) ==
               "Whirlfloc T is counted in whole tablets"
    end

    test "movements, Used in brewing by Oldest first, never a fraction", c do
      a = lot!(c, c.wf["id"], "2")
      b = lot!(c, c.wf["id"], "2")

      move =
        &req(
          c.brewer,
          :post,
          "/api/inventory_movements",
          Map.merge(%{"kind" => "used", "occurred_on" => today()}, &1)
        )

      assert base(move.(%{"lot_id" => a["id"], "quantity" => "2.5"})) ==
               "Whirlfloc T is counted in whole tablets"

      assert base(
               move.(%{
                 "product_id" => c.wf["id"],
                 "allocation" => "oldest_first",
                 # Above 1 but not whole (below 1 is "at least 1 tablet", Stop 2).
                 "quantity" => "1.5"
               })
             ) ==
               "Whirlfloc T is counted in whole tablets"

      assert {201, %{"data" => moves}} =
               move.(%{
                 "product_id" => c.wf["id"],
                 "allocation" => "oldest_first",
                 "quantity" => "3"
               })

      assert Enum.map(moves, &{&1["lot_id"], Decimal.to_integer(Decimal.new(&1["quantity"]))}) ==
               [{a["id"], -2}, {b["id"], -1}]

      for m <- Repo.all(Movement),
          do: assert(Decimal.eq?(m.quantity, Decimal.round(m.quantity, 0)))
    end

    test "counts, in total and by lot", c do
      lot = lot!(c, c.wf["id"], "10")

      count =
        &req(
          c.brewer,
          :post,
          "/api/ingredient_products/#{c.wf["id"]}/count",
          Map.put(&1, "counted_on", today())
        )

      assert base(count.(%{"mode" => "total", "counted" => "8.5"})) ==
               "Whirlfloc T is counted in whole tablets"

      assert base(
               count.(%{
                 "mode" => "by_lot",
                 "lots" => [%{"lot_id" => lot["id"], "counted" => "7.5"}]
               })
             ) ==
               "Whirlfloc T is counted in whole tablets"

      assert {201, _} = count.(%{"mode" => "total", "counted" => "8"})
    end

    test "offer pack sizes and receipts", c do
      bsg = c.bsg.id

      offer =
        &req(
          c.brewer,
          :post,
          "/api/supplier_offers",
          Map.merge(%{"product_id" => c.wf["id"], "supplier_party_id" => bsg}, &1)
        )

      assert base(offer.(%{"pack_size" => "872.3"})) == "Whirlfloc T is counted in whole tablets"
      {201, %{"data" => o}} = offer.(%{"pack_size" => "872"})
      # §4.2: an each offer starts as a tub.
      assert o["pack_name"] == "tub"
      price!(Repo.get!(SupplierOffer, o["id"]), "92.00")

      order = fn ->
        {201, %{"data" => order}} =
          req(c.brewer, :post, "/api/purchase_orders", %{
            "supplier_party_id" => bsg,
            "ordered_on" => today(),
            "lines" => [%{"offer_id" => o["id"], "packs_ordered" => 1}]
          })

        order
      end

      receive = fn order ->
        [line] = order["lines"]

        req(c.brewer, :post, "/api/purchase_orders/#{order["id"]}/receive", %{
          "received_on" => today(),
          "lines" => [
            %{
              "id" => line["id"],
              "packs_received" => 1,
              "allocations" => [%{"lot_number" => "WF-#{order["id"]}", "packs" => 1}]
            }
          ]
        })
      end

      assert {200, _} = receive.(order.())
      [lot] = Repo.all(from(l in IngredientLot, where: l.product_id == ^c.wf["id"]))
      assert Decimal.eq?(RockcutApi.Ingredients.Inventory.on_hand_by_lot([lot.id])[lot.id], 872)

      # An offer whose size isn't whole (made before the unit was each) can't be received into fractions.
      second = order.()

      Repo.update_all(from(x in SupplierOffer, where: x.id == ^o["id"]),
        set: [pack_size: Decimal.new("872.5")]
      )

      assert base(receive.(second)) == "Whirlfloc T is counted in whole tablets"
    end
  end

  describe "categories (A9, §4.1)" do
    test "Fruits, Spices & Flavorings and Sugars and Extracts take no field and no child; Other Consumables takes a child",
         c do
      field = &%{"category_id" => &1, "field_name" => "Origin", "field_type" => "text"}

      for {cat, name} <- [
            {c.fruits, "Fruits"},
            {c.spices, "Spices & Flavorings"},
            {c.sugars, "Sugars and Extracts"}
          ] do
        assert %{"category_id" => ["#{name} use products, not custom fields"]} ==
                 errors(req(c.owner, :post, "/api/category_field_definitions", field.(cat.id)))

        assert %{"parent_id" => ["#{name} has no subcategories"]} ==
                 errors(
                   req(c.owner, :post, "/api/ingredient_categories", %{
                     "name" => "X #{cat.id}",
                     "parent_id" => cat.id
                   })
                 )
      end

      # D64 §4.1: Yeast Strains takes no field any more; Other Consumables still does.
      {201, %{"data" => %{"id" => id}}} =
        req(c.owner, :post, "/api/category_field_definitions", field.(c.consumables.id))

      assert %{"category_id" => ["Fruits use products, not custom fields"]} ==
               errors(
                 req(c.owner, :put, "/api/category_field_definitions/#{id}", %{
                   "category_id" => c.fruits.id
                 })
               )

      {201, %{"data" => child}} =
        req(c.owner, :post, "/api/ingredient_categories", %{
          "name" => "Cleaning",
          "parent_id" => c.consumables.id
        })

      assert child["catalog"]["key"] == "consumables"
      assert child["catalog"]["forms"] == ["Powder", "Flake", "Liquid", "Tablet"]
    end
  end

  describe "the ingredient formula" do
    test "optional, at most 40 characters, on every category", c do
      put = &req(c.brewer, :put, "/api/ingredients/#{c.gypsum.id}", %{"formula" => &1})

      assert {200, %{"data" => %{"formula" => "CaSO₄·2H₂O"}}} = put.("CaSO₄·2H₂O")
      assert %{"formula" => [_]} = errors(put.(String.duplicate("x", 41)))
      assert {200, %{"data" => %{"formula" => nil}}} = put.(" ")
    end
  end

  describe "contracts (decision 3)" do
    test "a D65 product can't go on a contract line; grain can", c do
      dextrose = product!(c, %{"ingredient_id" => c.dextrose.id, "form" => "Dry"})
      body = &%{"supplier_party_id" => c.bsg.id, "year" => Tasks.today().year, "lines" => [&1]}

      assert base(
               req(
                 c.mgr,
                 :post,
                 "/api/contracts",
                 body.(%{"product_id" => dextrose["id"], "quantity" => 10, "price" => "45.50"})
               )
             ) ==
               "Contracts are for grain and hops"

      assert {201, _} =
               req(
                 c.mgr,
                 :post,
                 "/api/contracts",
                 body.(%{"product_id" => c.product.id, "quantity" => 10, "price" => "45.50"})
               )
    end
  end

  describe "lots in D65 categories" do
    test "need their product", c do
      assert %{"product_id" => ["A lot needs its product"]} =
               errors(
                 req(c.brewer, :post, "/api/ingredient_lots", %{
                   "ingredient_id" => c.strawberry.id,
                   "received_date" => today(),
                   "initial_kind" => "opening",
                   "initial_quantity" => "5"
                 })
               )

      p = product!(c, %{"ingredient_id" => c.strawberry.id, "form" => "Whole", "unit" => "lb"})
      assert lot!(c, p["id"], "5")["product_id"] == p["id"]
    end
  end
end
