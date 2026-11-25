defmodule RockcutApiWeb.D63UnitsTest do
  @moduledoc """
  D63 §5.1 on the API: g and mL on Process Aids (and nowhere else they
  weren't), through products, offers (250 g … 10,000 mL, the edge), lots,
  counts, movements, orders, To order, Totals and the refusals' words. Every
  rule has a refusal and an allowed case. Own rows only.
  """
  use RockcutApiWeb.ConnCase, async: false

  import RockcutApi.PersonaFixtures
  import RockcutApi.IngredientFixtures, except: [product!: 2, product!: 3, product!: 4]

  alias RockcutApi.{Repo, Tasks}
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory}
  alias RockcutApi.Ingredients.{Catalog, Units}

  setup do
    p = personas(~w(owner brewer1))
    c = Map.merge(grain_catalog!(), d65_catalog!())
    zinc = Repo.insert!(%Ingredient{name: "Zinc", category_id: c.process_aids.id})
    enzyme = Repo.insert!(%Ingredient{name: "Enzyme", category_id: c.process_aids.id})
    Map.merge(c, %{brewer: p["brewer1"], owner: p["owner"], zinc: zinc, enzyme: enzyme})
  end

  defp req(user, verb, path, params \\ %{}) do
    conn = call(user, verb, path, params)
    {conn.status, if(conn.resp_body == "", do: nil, else: Jason.decode!(conn.resp_body))}
  end

  defp errors({422, %{"errors" => errors}}), do: errors
  defp base({422, %{"errors" => %{"base" => [message]}}}), do: message
  defp today, do: Date.to_iso8601(Tasks.today())
  defp d(v), do: Decimal.new(v)

  defp product(c, attrs), do: req(c.brewer, :post, "/api/ingredient_products", attrs)

  defp product!(c, ingredient, form, unit) do
    {201, %{"data" => p}} =
      product(c, %{"ingredient_id" => ingredient.id, "form" => form, "unit" => unit})

    p
  end

  defp offer(c, p, size, extra \\ %{}) do
    req(
      c.brewer,
      :post,
      "/api/supplier_offers",
      Map.merge(
        %{"product_id" => p["id"], "supplier_party_id" => c.bsg.id, "pack_size" => size},
        extra
      )
    )
  end

  defp lot(c, p, quantity, extra \\ %{}) do
    req(
      c.brewer,
      :post,
      "/api/ingredient_lots",
      Map.merge(
        %{
          "product_id" => p["id"],
          "supplier_party_id" => c.bsg.id,
          "received_date" => today(),
          "initial_kind" => "opening",
          "initial_quantity" => quantity
        },
        extra
      )
    )
  end

  defp movement(c, lot, quantity) do
    req(c.brewer, :post, "/api/inventory_movements", %{
      "kind" => "used",
      "lot_id" => lot["id"],
      "quantity" => quantity,
      "occurred_on" => today()
    })
  end

  describe "where g and mL are" do
    test "Process Aids and its old name have the same lists; Water Salts, spices and fruit don't take them",
         c do
      old = Repo.insert!(%IngredientCategory{name: "FININGS", parent_id: c.consumables.id})

      for f <- [&Catalog.forms/2, &Catalog.units/2, &Catalog.pack_names/2],
          do: assert(f.("consumables", old) == f.("consumables", c.process_aids))

      assert Catalog.units("consumables", old) == ["fl oz", "lb", "each", "g", "mL"]
      assert Catalog.pack_names("consumables", old) == ~w(jug bottle bag tub)

      for {ingredient, form, unit} <- [
            {c.gypsum, "Powder", "g"},
            {c.cinnamon, "Ground", "g"},
            {c.vanilla, "Extract", "mL"},
            {c.strawberry, "Purée", "mL"},
            {c.dextrose, "Dry", "g"}
          ],
          do:
            assert(
              %{"unit" => [_]} =
                errors(
                  product(c, %{"ingredient_id" => ingredient.id, "form" => form, "unit" => unit})
                )
            )

      assert %{"unit" => ["must be one of fl oz, lb, each, g, mL"]} =
               errors(
                 product(c, %{"ingredient_id" => c.zinc.id, "form" => "Powder", "unit" => "kg"})
               )

      # "ml" isn't a unit: one spelling.
      assert %{"unit" => [_]} =
               errors(
                 product(c, %{"ingredient_id" => c.enzyme.id, "form" => "Liquid", "unit" => "ml"})
               )

      for {ingredient, form, unit} <- [
            {c.zinc, "Powder", "g"},
            {c.enzyme, "Liquid", "mL"}
          ] do
        p = product!(c, ingredient, form, unit)
        assert {p["unit"], p["unit_label"]} == {unit, unit}
      end
    end

    test "the category JSON lists them, with their usual packs", c do
      {200, %{"data" => cats}} = req(c.brewer, :get, "/api/ingredient_categories")
      catalog = Enum.find(cats, &(&1["id"] == c.process_aids.id))["catalog"]
      assert catalog["units"] == ["fl oz", "lb", "each", "g", "mL"]
      assert catalog["default_packs"]["g"] == "bag"
      assert catalog["default_packs"]["mL"] == "bottle"
      assert catalog["ions"] == false
    end

    test "a g product's unit is fixed once it has a lot", c do
      p = product!(c, c.zinc, "Powder", "g")
      {201, _} = lot(c, p, "5")

      assert %{"unit" => ["This product has lots, so its unit stays g"]} =
               errors(
                 req(c.brewer, :put, "/api/ingredient_products/#{p["id"]}", %{
                   "unit" => "lb",
                   "lock_version" => p["lock_version"]
                 })
               )
    end
  end

  describe "pack sizes (250 g, 1,000 g, 1,000 mL, 10,000 mL)" do
    test "an offer: each size, its usual pack, the 10,000 edge and past it", c do
      g = product!(c, c.zinc, "Powder", "g")
      ml = product!(c, c.enzyme, "Liquid", "mL")

      for {p, size, pack} <- [
            {g, "250", "bag"},
            {g, "1000", "bag"},
            {ml, "1000", "bottle"},
            {ml, "10000", "bottle"}
          ] do
        assert {201, %{"data" => o}} = offer(c, p, size)
        assert o["pack_name"] == pack
        assert Decimal.eq?(d(o["pack_size"]), d(size))
      end

      assert {201, %{"data" => %{"pack_name" => "jug"}}} =
               offer(c, ml, "10000", %{"pack_name" => "jug"})

      for size <- ["10000.01", "10001", "0"],
          do:
            assert(
              %{"pack_size" => ["must be more than 0 and at most 10,000"]} =
                errors(offer(c, ml, size))
            )

      assert %{"pack_name" => ["must be jug or bottle or bag or tub"]} =
               errors(offer(c, g, "250", %{"pack_name" => "pail"}))
    end

    test "a lot: the same edge", c do
      ml = product!(c, c.enzyme, "Liquid", "mL")
      jug = %{"pack_name" => "jug", "pack_size" => "10000"}
      assert {201, %{"data" => l}} = lot(c, ml, "10000", jug)
      assert Decimal.eq?(d(l["pack_size"]), 10_000)

      assert %{"pack_size" => ["must be more than 0 and at most 10,000"]} =
               errors(lot(c, ml, "10", %{jug | "pack_size" => "10000.01"}))
    end
  end

  describe "quantities" do
    test "two decimals as lb has; below 0.01 is refused in the unit", c do
      g = product!(c, c.zinc, "Powder", "g")
      {201, %{"data" => l}} = lot(c, g, "0.01")
      assert Decimal.eq?(d(l["on_hand"]), d("0.01"))
      {201, %{"data" => l}} = lot(c, g, "480.25")

      assert base(movement(c, l, "0.001")) ==
               "Enter a quantity of at least 0.01 g and under 1,000,000 g"

      assert {201, _} = movement(c, l, "0.25")
      ml = product!(c, c.enzyme, "Liquid", "mL")

      assert base(lot(c, ml, "0")) ==
               "Enter a quantity of at least 0.01 mL and under 1,000,000 mL"

      assert base(lot(c, ml, "1000000")) ==
               "Enter a quantity of at least 0.01 mL and under 1,000,000 mL"
    end

    test "more than there is, refused in packs and the unit; a count in g", c do
      g = product!(c, c.zinc, "Powder", "g")

      {201, %{"data" => l}} =
        lot(c, g, "500", %{"pack_name" => "bag", "pack_size" => "250"})

      message = base(movement(c, l, "500.5"))
      assert message =~ "2 bags"
      refute message =~ "lb"
      assert {201, _} = movement(c, l, "10.5")

      assert {status, _} =
               req(c.brewer, :post, "/api/ingredient_products/#{g["id"]}/count", %{
                 "mode" => "total",
                 "counted" => "480",
                 "counted_on" => today()
               })

      assert status == 201
      {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{g["id"]}")
      assert Decimal.eq?(d(p["on_hand"]), 480)

      assert base(
               req(c.brewer, :post, "/api/ingredient_products/#{g["id"]}/count", %{
                 "mode" => "total",
                 "counted" => "-1",
                 "counted_on" => today()
               })
             ) == "The count must be 0 or more and under 1,000,000 g"
    end

    test "as the screens show them" do
      show = &Units.format_quantity(d(&1), &2, &3 && d(&3), &4, "packs")
      assert show.("500", "bag", "250", "g") == "2 bags"
      assert show.("480", "bag", "250", "g") == "1 bag 230 g"
      assert show.("12500.5", "jug", "10000", "mL") == "1 jug 2,500.5 mL"
      assert show.("1", nil, nil, "g") == "1 g"
      assert Units.format_quantity(d("1500"), "bottle", d("1000"), "mL", "lb") == "1,500 mL"
    end
  end

  test "ordered, received as 2 bags (500 g), To order, and Totals with g and mL in their own subtotals",
       c do
    g = product!(c, c.zinc, "Powder", "g")
    ml = product!(c, c.enzyme, "Liquid", "mL")
    {201, %{"data" => bag}} = offer(c, g, "250")
    {201, %{"data" => jug}} = offer(c, ml, "10000", %{"pack_name" => "jug"})

    for {o, price} <- [{bag, "18.50"}, {jug, "355.00"}],
        do:
          price!(
            Repo.get!(RockcutApi.Ingredients.SupplierOffer, o["id"]),
            price,
            Date.add(Tasks.today(), -1)
          )

    {201, %{"data" => order}} =
      req(c.brewer, :post, "/api/purchase_orders", %{
        "supplier_party_id" => c.bsg.id,
        "ordered_on" => today(),
        "lines" => [
          %{"offer_id" => bag["id"], "packs_ordered" => 2},
          %{"offer_id" => jug["id"], "packs_ordered" => 1}
        ]
      })

    assert Enum.map(
             order["by_unit"],
             &{&1["unit"], &1["unit_label"], Decimal.to_float(d(&1["quantity"]))}
           ) ==
             [{"g", "g", 500.0}, {"mL", "mL", 10_000.0}]

    {200, %{"data" => received}} =
      req(c.brewer, :post, "/api/purchase_orders/#{order["id"]}/receive", %{
        "received_on" => today(),
        "lines" =>
          for line <- order["lines"] do
            %{
              "id" => line["id"],
              "packs_received" => line["packs_ordered"],
              "allocations" => [
                %{"lot_number" => "D63-#{line["id"]}", "packs" => line["packs_ordered"]}
              ]
            }
          end
      })

    assert received["status"] == "received"

    {200, %{"data" => %{"rows" => rows, "total" => total}}} =
      req(c.owner, :get, "/api/ingredient_totals/inventory")

    zinc = Enum.find(rows, &(&1["product_id"] == g["id"]))
    assert Decimal.eq?(d(zinc["quantity"]), 500) and Decimal.eq?(d(zinc["packs"]), 2)
    assert zinc["pack_name"] == "bag" and zinc["unit_label"] == "g"
    assert Decimal.eq?(d(zinc["value"]), d("37.00"))
    enzyme = Enum.find(rows, &(&1["product_id"] == ml["id"]))
    # $355.00 / 10,000 mL: the cost per mL keeps the dollars.
    assert Decimal.eq?(d(enzyme["value"]), d("355.00"))
    assert Decimal.eq?(d(enzyme["per_unit"]), d("0.0355"))

    by_unit = Map.new(total["by_unit"], &{&1["unit"], d(&1["quantity"])})
    assert Decimal.eq?(by_unit["g"], 500) and Decimal.eq?(by_unit["mL"], 10_000)

    {200, %{"data" => orders}} = req(c.owner, :get, "/api/ingredient_totals/orders")
    units = Map.new(orders["total"]["by_unit"], &{&1["unit"], d(&1["quantity"])})
    assert Decimal.eq?(units["g"], 500) and Decimal.eq?(units["mL"], 10_000)

    # Below its minimum (5 bags): To order counts the bags on hand.
    {200, %{"data" => p}} = req(c.brewer, :get, "/api/ingredient_products/#{g["id"]}")

    assert {200, _} =
             req(c.brewer, :put, "/api/ingredient_products/#{g["id"]}", %{
               "min_on_hand_packs" => 5,
               "reorder_offer_id" => bag["id"],
               "lock_version" => p["lock_version"]
             })

    {200, %{"data" => reorder}} = req(c.brewer, :get, "/api/ingredient_reorder")
    assert row = Enum.find(reorder, &(&1["product_id"] == g["id"]))
    assert Decimal.eq?(d(row["on_hand"]), 500)
    assert row["to_order"] == 3
  end
end
