defmodule RockcutApi.Seeds.D65SeedsTest do
  @moduledoc """
  D65 §7 and the reference-data amendments: `seeds/d65_reference.exs`
  (through `priv/repo/seeds.exs`) twice gives the same rows: 36 new
  ingredients (Dextrose (Corn Sugar) and Whirlfloc already there), 29
  products, 30 offers of which 26 have a price, no lots. Spot checks per
  batch, and the grain and hop reference counts are left alone.
  """
  # Not async: seeds.exs runs the synthetic setup (global env reads).
  use RockcutApi.DataCase, async: false

  import Ecto.Query
  import ExUnit.CaptureIO

  alias RockcutApi.Brewing.{Ingredient, IngredientLot}
  alias RockcutApi.Ingredients.{Catalog, Ions, OfferPrice, Product, Products, SupplierOffer}

  @moduletag :capture_log

  @d65 ~w(fruits spices sugars consumables)

  defp seed!, do: capture_io(fn -> Code.eval_file("priv/repo/seeds.exs") end)

  # The reference rows: D65 categories, nothing the synthetic setup or a test made.
  defp ingredients do
    from i in Ingredient,
      where: i.category_id in ^Catalog.category_ids(@d65),
      where: not like(i.name, "[SEED]%") and not like(i.name, "[TEST-TEMP]%")
  end

  defp products do
    from p in Product,
      join: i in subquery(ingredients()),
      on: i.id == p.ingredient_id,
      where: is_nil(p.name) or not like(p.name, "[SEED]%")
  end

  defp offers,
    do: from(o in SupplierOffer, join: p in subquery(products()), on: p.id == o.product_id)

  defp counts do
    %{
      ingredients: Repo.aggregate(ingredients(), :count),
      products: Repo.aggregate(products(), :count),
      offers: Repo.aggregate(offers(), :count),
      priced:
        Repo.aggregate(
          from(o in subquery(offers()),
            where: o.id in subquery(from(p in OfferPrice, select: p.offer_id))
          ),
          :count
        ),
      lots:
        Repo.aggregate(
          from(l in IngredientLot, join: p in subquery(products()), on: p.id == l.product_id),
          :count
        )
    }
  end

  defp product!(ingredient, form, extra \\ []) do
    query =
      from p in Product,
        join: i in assoc(p, :ingredient),
        where: i.name == ^ingredient and p.form == ^form,
        preload: [:manufacturer, :ingredient, feature_values: :feature_type, offers: :supplier]

    query =
      Enum.reduce(extra, query, fn {:maker, nil}, q ->
        from(p in q, where: is_nil(p.manufacturer_party_id))
      end)

    Repo.one!(query)
  end

  defp feature(product, key) do
    Enum.find(product.feature_values, &(&1.feature_type.key == key))
  end

  defp price(offer),
    do: Repo.one(from p in OfferPrice, where: p.offer_id == ^offer.id, select: p.price_per_pack)

  test "twice: 36 + 2 ingredients, 29 products, 30 offers, 26 priced, no lots, and D63's rows; grain and hops unchanged" do
    seed!()
    first = counts()

    hops =
      Repo.aggregate(
        from(p in Product,
          join: i in assoc(p, :ingredient),
          where: i.category_id in ^Catalog.category_ids(["hops"])
        ),
        :count
      )

    grain =
      Repo.aggregate(
        from(p in Product,
          join: i in assoc(p, :ingredient),
          where: i.category_id in ^Catalog.category_ids(["grains"])
        ),
        :count
      )

    seed!()
    assert counts() == first

    # 36 new plus the two the base seed has (Dextrose (Corn Sugar), Whirlfloc).
    # D63 §5: four process aids (an offer each), Allspice and Chamomile, and a
    # product for each of seven spices.
    assert first == %{
             ingredients: 38 + 4 + 2,
             products: 29 + 4 + 7,
             offers: 30 + 4,
             priced: 26,
             lots: 0
           }

    assert Repo.aggregate(
             from(p in Product,
               join: i in assoc(p, :ingredient),
               where: i.category_id in ^Catalog.category_ids(["hops"])
             ),
             :count
           ) == hops

    assert Repo.aggregate(
             from(p in Product,
               join: i in assoc(p, :ingredient),
               where: i.category_id in ^Catalog.category_ids(["grains"])
             ),
             :count
           ) == grain

    # D63: Pink Boots '24 and EKG.
    assert hops == 27 + 2 and grain == 44
  end

  test "spot checks: Gypsum, Strawberry, Black Strap Molasses, Whirlfloc T, SoNature Lime, the spices" do
    seed!()

    gypsum_i = Repo.get_by!(Ingredient, name: "Calcium Sulfate (Gypsum)")
    assert gypsum_i.formula == "CaSO₄·2H₂O"
    ions = Ions.get(gypsum_i.id)
    assert Decimal.eq?(ions["ca_ppm_per_g_gal"], Decimal.new("61.5"))
    assert Decimal.eq?(ions["so4_ppm_per_g_gal"], Decimal.new("147.4"))
    assert map_size(ions) == 2
    gypsum = product!("Calcium Sulfate (Gypsum)", "Powder")
    assert gypsum.manufacturer_party_id == nil and gypsum.unit == "lb"
    assert Products.display_name(gypsum) == "Calcium Sulfate (Gypsum) Powder · None"
    [bag] = gypsum.offers

    assert {bag.supplier.name, bag.pack_name, Decimal.to_integer(bag.pack_size)} ==
             {"BSG", "bag", 50}

    assert Decimal.eq?(price(bag), Decimal.new("32.00"))

    # D63 §5.4: calcium chloride's product is Anhydrous's; Hydrous has none.
    cacl = product!("Calcium Chloride (Anhydrous)", "Flake")
    assert Decimal.eq?(price(hd(cacl.offers)), Decimal.new("77.00"))

    refute Repo.exists?(
             from p in Product,
               join: i in assoc(p, :ingredient),
               where: i.name == "Calcium Chloride (Hydrous)"
           )

    strawberry = product!("Strawberry", "Purée")
    assert strawberry.manufacturer.name == "Aseptic Fruit"

    assert Enum.map(strawberry.offers, &Decimal.to_integer(&1.pack_size)) |> Enum.sort() == [
             11,
             44
           ]

    brix = feature(strawberry, "brix")
    assert Decimal.eq?(brix.value, Decimal.new("6.5")) and Decimal.eq?(brix.value_high, 9)

    watermelon = feature(product!("Watermelon", "Purée"), "brix")
    assert Decimal.eq?(watermelon.value, 12) and Decimal.eq?(watermelon.value_high, 12)
    assert Repo.exists?(from i in Ingredient, where: i.name == "Tangerine")

    molasses = product!("Black Strap Molasses", "Liquid")
    assert molasses.manufacturer.name == "Sweetener Sup Co."
    assert Decimal.eq?(feature(molasses, "extract_fgdb").value, Decimal.new("81.95"))
    assert Decimal.eq?(price(hd(molasses.offers)), Decimal.new("49.20"))

    honey = product!("Honey", "Liquid")
    assert hd(honey.offers).supplier.name == "Redstone"

    dextrose = product!("Dextrose (Corn Sugar)", "Dry")

    assert Repo.aggregate(from(i in Ingredient, where: i.name == "Dextrose (Corn Sugar)"), :count) ==
             1

    assert Decimal.eq?(feature(dextrose, "extract_fgdb").value, Decimal.new("91.3"))

    whirlfloc = product!("Whirlfloc", "Tablet")
    assert {whirlfloc.name, whirlfloc.unit, whirlfloc.manufacturer_party_id} == {"T", "each", nil}
    assert Catalog.unit_label(whirlfloc.unit, whirlfloc.form) == "tablets"
    [tub] = whirlfloc.offers

    assert {tub.pack_name, Decimal.to_integer(tub.pack_size), tub.pack_note} ==
             {"tub", 872, "5 lb"}

    assert Decimal.eq?(price(tub), Decimal.new("92.00"))

    lime = product!("Lime", "Purée", maker: nil)
    # D63 §5.3.
    assert Decimal.eq?(feature(lime, "brix").value, 8)
    [pail] = lime.offers

    assert {pail.supplier.name, Decimal.to_integer(pail.pack_size), price(pail)} ==
             {"SoNature", 40, nil}

    assert Repo.aggregate(
             from(p in Product, join: i in assoc(p, :ingredient), where: i.name == "Lemon"),
             :count
           ) == 2

    spices =
      Repo.all(
        from i in Ingredient,
          where: i.category_id in ^Catalog.category_ids(["spices"]),
          select: i.name
      )

    assert "Timut Pepper" in spices and "Peppermint Leaf" in spices and
             length(Enum.reject(spices, &String.starts_with?(&1, "["))) == 12
  end

  test "an edit made on the screens sticks: a price, a formula and a product are left alone" do
    seed!()
    gypsum = Repo.get_by!(Ingredient, name: "Calcium Sulfate (Gypsum)")
    Repo.update!(Ecto.Changeset.change(gypsum, formula: "CaSO4.2H2O"))
    [bag] = product!("Calcium Sulfate (Gypsum)", "Powder").offers

    Repo.update_all(from(p in OfferPrice, where: p.offer_id == ^bag.id),
      set: [price_per_pack: Decimal.new("33.00")]
    )

    seed!()
    assert Repo.get!(Ingredient, gypsum.id).formula == "CaSO4.2H2O"
    assert Decimal.eq?(price(bag), Decimal.new("33.00"))
  end

  test "synthetic setup twice: three [SEED] products in gal, lb and each, each with an offer, a price, a minimum and one lot" do
    seed!()

    for _ <- 1..2, do: {:ok, _} = RockcutApi.Seeds.Synthetic.setup()

    rows =
      Repo.all(
        from p in Product,
          join: i in assoc(p, :ingredient),
          # D64 adds two [SEED] yeast products of its own (`d64_seeds_test`).
          where:
            like(i.name, "[SEED]%") and
              i.category_id not in ^RockcutApi.Ingredients.Catalog.category_ids(["yeast"]),
          order_by: i.name,
          preload: [:lots, offers: :prices],
          select: {i.name, p}
      )

    assert Enum.map(rows, fn {name, p} ->
             {name, p.form, p.unit, p.min_on_hand_packs, p.manufacturer_party_id}
           end) == [
             {"[SEED] Fining Tablets", "Tablet", "each", 2, nil},
             {"[SEED] Peach", "Purée", "gal", 2, nil},
             {"[SEED] Rice Syrup Solids", "Dry", "lb", 2, nil}
           ]

    for {_name, p} <- rows do
      assert [%{prices: [_]}] = p.offers
      assert [_] = p.lots
    end

    stock =
      RockcutApi.Ingredients.Inventory.on_hand_by_product(Enum.map(rows, fn {_, p} -> p.id end))

    assert Enum.map(rows, fn {_, p} -> Decimal.to_float(stock[p.id]) end) == [600.0, 12.5, 75.0]
  end
end
