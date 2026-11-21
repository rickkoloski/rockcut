defmodule RockcutApi.Seeds.GrainSeedsTest do
  @moduledoc """
  D60 §3.1, §6, Appendices A and B: `priv/repo/seeds.exs` (with
  `seeds/grain_reference.exs`, and the synthetic setup it runs locally)
  twice gives the same rows: Grains' five children with all 38 grains on
  them, 44 maltster products, 8 companies with their roles, the offers, the
  applicability, no Origin/Maltster fields, and two `[SEED]` lots. A grain
  moved by hand stays where it was put.
  """
  # Not async: seeds.exs runs the synthetic setup (global env reads).
  use RockcutApi.DataCase, async: false

  import Ecto.Query
  import ExUnit.CaptureIO

  alias RockcutApi.Brewing.{
    Brand,
    CategoryFieldDefinition,
    Ingredient,
    IngredientCategory,
    IngredientLot,
    Recipe,
    RecipeIngredient
  }

  alias RockcutApi.Ingredients.{
    CategoryFeatureType,
    Contract,
    ContractLine,
    LotFeatureValue,
    Movement,
    OfferPrice,
    Party,
    PartyRole,
    Product,
    ProductFeatureValue,
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierOffer
  }

  alias RockcutApi.Seeds.Synthetic

  @moduletag :capture_log

  @children ["Base", "Crystal/Caramel", "Kilned", "Specialty", "Roasted"]

  defp seed!, do: capture_io(fn -> Code.eval_file("priv/repo/seeds.exs") end)

  defp grains, do: Repo.get_by!(IngredientCategory, name: "Grains")

  defp grains_by_child do
    Repo.all(
      from i in Ingredient,
        join: c in IngredientCategory,
        on: c.id == i.category_id,
        where: c.parent_id == ^grains().id,
        group_by: c.name,
        select: {c.name, count(i.id)}
    )
    |> Map.new()
  end

  defp roles do
    Repo.all(
      from r in PartyRole,
        join: p in Party,
        on: p.id == r.party_id,
        where: not like(p.name, "[SEED]%"),
        order_by: [p.name, r.role],
        select: {p.name, r.role}
    )
  end

  defp counts do
    for schema <- [
          IngredientCategory,
          Ingredient,
          Party,
          PartyRole,
          Product,
          ProductFeatureValue,
          SupplierOffer,
          CategoryFeatureType,
          CategoryFieldDefinition,
          IngredientLot,
          LotFeatureValue,
          Movement,
          PurchaseOrder,
          PurchaseOrderLine,
          Contract,
          ContractLine
        ],
        into: %{},
        do: {schema, Repo.aggregate(schema, :count)}
  end

  test "twice: the same catalog, reference data and [SEED] lots" do
    seed!()
    first = counts()
    seed!()
    assert counts() == first

    children =
      Repo.all(
        from c in IngredientCategory,
          where: c.parent_id == ^grains().id,
          order_by: c.sort_order,
          select: c.name
      )

    assert children == @children

    assert grains_by_child() ==
             %{
               "Base" => 16,
               "Crystal/Caramel" => 10,
               "Kilned" => 3,
               "Specialty" => 4,
               "Roasted" => 5
             }

    refute Repo.exists?(from i in Ingredient, where: i.category_id == ^grains().id)
    assert first[IngredientCategory] == 13

    # D62: plus the hop reference's 27 products and offers, and 26 × 3
    # ranges (Pink Boots Blend has none; `HopSeedsTest`).
    assert first[Product] == 44 + 27
    assert first[SupplierOffer] == 44 + 27
    # Blanks stay blank (23 of them, mostly protein), so fewer than 44 × 5.
    assert first[ProductFeatureValue] == 44 * 5 - 23 + 26 * 3

    # D62: BSG is a hop manufacturer too, and the hop companies both.
    assert roles() == [
             {"BSG", "manufacturer"},
             {"BSG", "supplier"},
             {"Billy Goat", "manufacturer"},
             {"Billy Goat", "supplier"},
             {"Crisp", "manufacturer"},
             {"Dingemans", "manufacturer"},
             {"Grain Millers", "manufacturer"},
             {"John Fearless", "manufacturer"},
             {"John Fearless", "supplier"},
             {"Lupulin Exchange", "manufacturer"},
             {"Lupulin Exchange", "supplier"},
             {"Michigan Hop Alliance", "manufacturer"},
             {"Michigan Hop Alliance", "supplier"},
             {"Rahr", "manufacturer"},
             {"Root Shoot", "manufacturer"},
             {"Root Shoot", "supplier"},
             {"Simpsons", "manufacturer"},
             {"Weyermann", "manufacturer"},
             {"Yakima Chief Hops", "manufacturer"},
             {"Yakima Chief Hops", "supplier"}
           ]

    assert Repo.aggregate(from(p in Party, where: not like(p.name, "[SEED]%")), :count) == 8 + 5

    refute Repo.exists?(
             from d in CategoryFieldDefinition,
               where: d.category_id == ^grains().id and d.field_name in ["Origin", "Maltster"]
           )

    # Grains: five features; Hops alpha, beta and oil (D62); Yeast Strains attenuation.
    assert first[CategoryFeatureType] == 9
  end

  test "offers: sack size, milled from the order name, Root Shoot with no order name" do
    seed!()

    offers =
      Repo.all(
        from o in SupplierOffer,
          join: p in assoc(o, :product),
          join: i in assoc(p, :ingredient),
          join: m in assoc(p, :manufacturer),
          join: s in assoc(o, :supplier),
          select: {i.name, m.name, s.name, o.order_name, o.pack_size, o.form}
      )

    assert {"2-Row", "Rahr", "BSG", "Rahr - Standard 2-row (milled)", sack, "milled"} =
             Enum.find(offers, &match?({"2-Row", "Rahr", _, _, _, _}, &1))

    assert Decimal.equal?(sack, 55)

    assert {_, _, "Root Shoot", nil, rs_sack, "whole"} =
             Enum.find(offers, &match?({"Pilsner", "Root Shoot", _, _, _, _}, &1))

    assert Decimal.equal?(rs_sack, 50)

    assert {_, "Crisp", "BSG", "Crisp - Brown Malt", _, "whole"} =
             Enum.find(offers, &match?({"Brown Malt", _, _, _, _, _}, &1))

    assert {_, "Dingemans", _, "Dingemans - Biscuit", _, _} =
             Enum.find(offers, &match?({"Biscuit", _, _, _, _, _}, &1))

    assert {_, "Grain Millers", _, _, oats_sack, "whole"} =
             Enum.find(offers, &match?({"Oats, Flaked", _, _, _, _, _}, &1))

    assert Decimal.equal?(oats_sack, 50)
    assert Enum.count(offers, &(elem(&1, 5) == "milled")) == 13
  end

  test "a 0 diastatic power is stored; Malted Oats' blank isn't" do
    seed!()

    dp = fn grain ->
      Repo.one(
        from v in ProductFeatureValue,
          join: f in assoc(v, :feature_type),
          join: p in assoc(v, :product),
          join: i in assoc(p, :ingredient),
          where: f.key == "diastatic_power_lintner" and i.name == ^grain,
          select: v.value
      )
    end

    assert Decimal.equal?(dp.("Black Malt"), 0)
    assert dp.("Oats, Malted") == nil
  end

  test "a grain moved by hand to another child isn't moved back" do
    seed!()
    specialty = Repo.get_by!(IngredientCategory, name: "Specialty")
    two_row = Repo.get_by!(Ingredient, name: "2-Row")
    two_row |> Ecto.Changeset.change(category_id: specialty.id) |> Repo.update!()

    seed!()

    assert Repo.reload!(two_row).category_id == specialty.id
    assert Repo.aggregate(from(i in Ingredient, where: i.name == "2-Row"), :count) == 1
  end

  test "synthetic setup twice: two [SEED] lots of Rahr 2-Row with their opening amounts" do
    seed!()
    {:ok, _} = Synthetic.setup()

    lots =
      Repo.all(
        from l in IngredientLot,
          where: like(l.lot_number, "[SEED]%"),
          order_by: l.received_date,
          preload: [:movements, :feature_values, product: [:ingredient, :manufacturer]]
      )

    assert [older, newer] = lots
    today = RockcutApi.Tasks.today()
    assert older.received_date == Date.add(today, -30)
    assert newer.received_date == Date.add(today, -7)

    for {lot, lb} <- [{older, 165}, {newer, 550}] do
      assert lot.product.ingredient.name == "2-Row"
      assert lot.product.manufacturer.name == "Rahr"
      assert Decimal.equal?(lot.pack_size, 55)
      assert [%Movement{kind: "opening", quantity: q}] = lot.movements
      assert Decimal.equal?(q, lb)
      assert length(lot.feature_values) == 5
    end

    assert %Party{} = mountain = Repo.get_by(Party, name: "[SEED] Mountain Brewing")
    assert Repo.get_by(PartyRole, party_id: mountain.id).role == "partner_brewery"
  end

  test "synthetic setup without Rahr 2-Row: no [SEED] lots, no error" do
    seed!()

    Repo.get_by!(Party, name: "Rahr")
    |> Ecto.Changeset.change(name: "Rahr Malting")
    |> Repo.update!()

    assert {:ok, _} = Synthetic.setup()
    refute Repo.exists?(from l in IngredientLot, where: like(l.lot_number, "[SEED]%"))
  end

  # Stage 4: the Playwright specs make [TEST-TEMP] products, offers, prices,
  # lots with movements, companies and grains; setup removes them all (the
  # API won't delete a lot with movements) and leaves the reference rows and
  # [SEED] lots alone.
  test "synthetic setup deletes [TEST-TEMP] ingredient rows, movements and all" do
    seed!()
    {:ok, _} = Synthetic.setup()
    before = counts()

    rahr = Repo.get_by!(Party, name: "Rahr")
    bsg = Repo.get_by!(Party, name: "BSG")
    two_row = Repo.get_by!(Ingredient, name: "2-Row")
    reference = Repo.get_by!(Product, ingredient_id: two_row.id, manufacturer_party_id: rahr.id)

    maltster = party!("[TEST-TEMP] Maltster", "manufacturer")
    partner = party!("[TEST-TEMP] Partner", "partner_brewery")
    grain = Repo.insert!(%Ingredient{name: "[TEST-TEMP] Grain", category_id: two_row.category_id})

    # One product tagged on its name, one under a tagged grain, one by a tagged maltster.
    products = [
      Repo.insert!(%Product{
        ingredient_id: two_row.id,
        manufacturer_party_id: rahr.id,
        name: "[TEST-TEMP] P"
      }),
      Repo.insert!(%Product{ingredient_id: grain.id, manufacturer_party_id: rahr.id}),
      Repo.insert!(%Product{ingredient_id: two_row.id, manufacturer_party_id: maltster.id})
    ]

    for product <- products do
      offer =
        Repo.insert!(%SupplierOffer{
          product_id: product.id,
          supplier_party_id: bsg.id,
          pack_size: Decimal.new(55),
          form: "whole"
        })

      Repo.insert!(%OfferPrice{
        offer_id: offer.id,
        price_per_pack: Decimal.new("48.5"),
        effective_on: ~D[2026-11-01]
      })

      lot =
        Repo.insert!(%IngredientLot{
          ingredient_id: product.ingredient_id,
          product_id: product.id,
          lot_number: "L1",
          pack_size: Decimal.new(55)
        })

      Repo.insert!(%LotFeatureValue{
        lot_id: lot.id,
        feature_type_id: hd(Repo.all(CategoryFeatureType)).feature_type_id,
        value: Decimal.new(2)
      })

      Repo.insert!(%Movement{
        lot_id: lot.id,
        kind: "opening",
        quantity: Decimal.new(110),
        occurred_on: ~D[2026-11-01]
      })

      Repo.insert!(%Movement{
        lot_id: lot.id,
        kind: "loaned_out",
        quantity: Decimal.new(-55),
        occurred_on: ~D[2026-11-02],
        partner_party_id: partner.id
      })
    end

    # A tagged lot of the reference product, used in a recipe.
    tagged_lot =
      Repo.insert!(%IngredientLot{
        ingredient_id: two_row.id,
        product_id: reference.id,
        lot_number: "[TEST-TEMP] L2",
        pack_size: Decimal.new(55)
      })

    Repo.insert!(%Movement{
      lot_id: tagged_lot.id,
      kind: "opening",
      quantity: Decimal.new(55),
      occurred_on: ~D[2026-11-01]
    })

    brand = Repo.insert!(%Brand{name: "Real brand"})
    recipe = Repo.insert!(%Recipe{brand_id: brand.id, batch_size: Decimal.new(10)})

    Repo.insert!(%RecipeIngredient{
      recipe_id: recipe.id,
      lot_id: tagged_lot.id,
      amount: Decimal.new(10),
      unit: "lb"
    })

    {:ok, _} = Synthetic.setup()

    assert counts() == before
    for p <- products, do: refute(Repo.get(Product, p.id))
    refute Repo.get(Ingredient, grain.id)
    refute Repo.get(Party, maltster.id)
    refute Repo.get(Party, partner.id)
    refute Repo.get(IngredientLot, tagged_lot.id)
    assert Repo.reload(recipe)
    assert Repo.reload(reference)
    assert Repo.exists?(from l in IngredientLot, where: like(l.lot_number, "[SEED]%"))
  end

  # D61: orders and contracts the purchasing specs make: a [TEST-TEMP]
  # supplier's (received into a lot of the reference product) and a real
  # supplier's with a line of a [TEST-TEMP] product. Setup removes them, the
  # receipt with them, then the supplier.
  test "synthetic setup deletes [TEST-TEMP] orders and contracts" do
    seed!()
    {:ok, _} = Synthetic.setup()
    before = counts()

    rahr = Repo.get_by!(Party, name: "Rahr")
    bsg = Repo.get_by!(Party, name: "BSG")
    two_row = Repo.get_by!(Ingredient, name: "2-Row")
    reference = Repo.get_by!(Product, ingredient_id: two_row.id, manufacturer_party_id: rahr.id)
    supplier = party!("[TEST-TEMP] Supplier", "supplier")

    temp =
      Repo.insert!(%Product{
        ingredient_id: two_row.id,
        manufacturer_party_id: rahr.id,
        name: "[TEST-TEMP] P"
      })

    offer = fn product, party ->
      Repo.insert!(%SupplierOffer{
        product_id: product.id,
        supplier_party_id: party.id,
        pack_size: Decimal.new(55),
        form: "whole"
      })
    end

    temp_offer = offer.(reference, supplier)
    bsg_temp_offer = offer.(temp, bsg)

    order = fn party, offer ->
      o =
        Repo.insert!(%PurchaseOrder{
          supplier_party_id: party.id,
          ordered_on: ~D[2026-11-01],
          status: "received",
          received_on: ~D[2026-11-02]
        })

      line =
        Repo.insert!(%PurchaseOrderLine{
          order_id: o.id,
          offer_id: offer.id,
          packs_ordered: 2,
          packs_received: 2,
          price_per_pack: Decimal.new(40)
        })

      {o, line}
    end

    {temp_order, temp_line} = order.(supplier, temp_offer)
    {bsg_order, _} = order.(bsg, bsg_temp_offer)

    lot =
      Repo.insert!(%IngredientLot{
        ingredient_id: two_row.id,
        product_id: reference.id,
        lot_number: "[TEST-TEMP] R1",
        pack_size: Decimal.new(55)
      })

    Repo.insert!(%Movement{
      lot_id: lot.id,
      kind: "received",
      quantity: Decimal.new(110),
      occurred_on: ~D[2026-11-02],
      purchase_order_line_id: temp_line.id
    })

    c1 = Repo.insert!(%Contract{supplier_party_id: supplier.id, year: 2030})

    Repo.insert!(%ContractLine{
      contract_id: c1.id,
      product_id: reference.id,
      offer_id: temp_offer.id,
      quantity: 1,
      price: Decimal.new(1)
    })

    c2 = Repo.insert!(%Contract{supplier_party_id: bsg.id, year: 2030})

    Repo.insert!(%ContractLine{
      contract_id: c2.id,
      product_id: temp.id,
      offer_id: bsg_temp_offer.id,
      quantity: 1,
      price: Decimal.new(1)
    })

    {:ok, _} = Synthetic.setup()

    assert counts() == before
    for r <- [temp_order, bsg_order, c1, c2, supplier, temp], do: refute(Repo.reload(r))
    assert Repo.reload(reference) && Repo.reload(bsg)
  end

  defp party!(name, role) do
    party = Repo.insert!(%Party{name: name})
    Repo.insert!(%PartyRole{party_id: party.id, role: role})
    party
  end
end
