defmodule RockcutApi.Ingredients.CatalogUnitsTest do
  @moduledoc """
  D62 Stage 1: `Catalog` (the rules per category key, never the name),
  `Units.format_quantity/5` and `quantity_display/1` (packs and a product's
  unit), and `Products.display_name/1` with the manufacturer and the form.
  """
  use RockcutApi.DataCase, async: false

  import RockcutApi.IngredientFixtures

  alias RockcutApi.Brewing
  alias RockcutApi.Ingredients.{Catalog, Inventory, Product, Products, Units}

  describe "Catalog" do
    setup do
      grain_catalog!()
    end

    test "a category's key is its own, a child's is its parent's", c do
      assert Catalog.key(c.grains) == "grains"
      assert Catalog.key(c.base) == "grains"
      assert Catalog.key(c.base.id) == "grains"
      assert Catalog.key(Repo.preload(c.base, :parent)) == "grains"
      assert Catalog.key(c.hops.id) == "hops"
      assert Catalog.ingredient_key(c.two_row.id) == "grains"
      assert Catalog.key(-1) == nil and Catalog.ingredient_key(nil) == nil
      assert Enum.sort(Catalog.category_ids(["grains"])) == Enum.sort([c.grains.id, c.base.id])
    end

    test "Stage 2 manages grain and hops; contracts count sacks for grain and lb for hops" do
      assert Catalog.managed?("grains")
      assert Catalog.managed?("hops")
      refute Catalog.managed?("yeast")
      refute Catalog.managed?("fruits")
      refute Catalog.managed?(nil)
      assert Catalog.contract_unit("grains") == :packs
      assert Catalog.contract_unit("hops") == :lb
      assert Catalog.contract_unit("fruits") == nil
      assert Catalog.units("grains") == ["lb"] and Catalog.forms("grains") == []
      assert Catalog.units("hops") == ["lb"]
      assert Catalog.forms("hops") == ["T90 Pellet", "Cryo", "Whole leaf", "Extract"]
      assert Catalog.pack_names() == ["sack", "box"]
      assert Catalog.pack_names("grains") == ["sack"] and Catalog.pack_names("hops") == ["box"]
      assert {"box", size} = Catalog.fixed_pack("hops")
      assert Decimal.eq?(size, 11)
      assert Catalog.fixed_pack("grains") == nil
    end

    test "renaming Grains changes nothing: a grain lot still needs its product and first movement",
         c do
      {:ok, _} = Brewing.update_ingredient_category(c.grains, %{name: "Malt"})
      {:ok, _} = Brewing.update_ingredient_category(c.base, %{name: "Base Malt"})

      assert Catalog.managed?(c.base.id)
      assert Catalog.ingredient_key(c.two_row.id) == "grains"

      user = RockcutApi.AccountsFixtures.user_fixture()

      assert {:error, {:invalid, %{product_id: [_]}}} =
               Inventory.create_lot(%{"ingredient_id" => c.two_row.id}, user)

      assert {:ok, lot} =
               Inventory.create_lot(
                 %{
                   "product_id" => c.product.id,
                   # D65: a product with offers needs its lot's supplier.
                   "supplier_party_id" => c.offer.supplier_party_id,
                   "received_date" => Date.to_iso8601(Date.add(RockcutApi.Tasks.today(), -1)),
                   "initial_kind" => "opening",
                   "initial_quantity" => "110"
                 },
                 user
               )

      assert Decimal.eq?(lot.on_hand, 110)

      # A category merely named Grains isn't grain.
      impostor = keyed_category!("Grains (old)", nil)
      {:ok, oats} = Brewing.create_ingredient(%{name: "Oats", category_id: impostor.id})
      refute Catalog.managed?(impostor.id)

      assert {:ok, %{product_id: nil}} =
               Inventory.create_lot(%{"ingredient_id" => oats.id}, user)
    end

    test "the formulas' hop and grain categories are found by key, whatever they're called", c do
      {:ok, _} = Brewing.update_ingredient_category(c.hops, %{name: "Hopfen"})
      assert Catalog.category_ids(["hops"]) == [c.hops.id]
    end
  end

  describe "Units.format_quantity/5" do
    defp q(qty, name, size, unit, mode),
      do:
        Units.format_quantity(
          Decimal.new(qty),
          name,
          size && Decimal.new(size),
          unit,
          mode
        )

    test "packs + the loose part in the unit, as grain has always read" do
      assert q("682.5", "sack", "55", "lb", "packs") == "12 sacks 22.5 lb"
      assert q("660", "sack", "55", "lb", "packs") == "12 sacks"
      assert q("55", "sack", "55", "lb", "packs") == "1 sack"
      assert q("22.5", "sack", "55", "lb", "packs") == "22.5 lb"
      assert q("-682.5", "sack", "55", "lb", "packs") == "12 sacks 22.5 lb"
      assert q("55000", "sack", "55", "lb", "packs") == "1,000 sacks"
    end

    test "total mode, or no pack size: the total in the unit" do
      assert q("682.5", "sack", "55", "lb", "lb") == "682.5 lb"
      assert q("1234.567", "sack", nil, "lb", "packs") == "1,234.57 lb"
      assert q("11.5", "pail", "5", "gal", "lb") == "11.5 gal"
    end

    test "other packs and units" do
      assert q("48.5", "box", "11", "lb", "packs") == "4 boxes 4.5 lb"
      assert q("11", "box", "11", "lb", "packs") == "1 box"
      assert q("11.5", "pail", "5", "gal", "packs") == "2 pails 1.5 gal"
      assert q("100", "bag", "50", "lb", "packs") == "2 bags"
      assert q("300", "jug", "128", "fl oz", "packs") == "2 jugs 44 fl oz"
      assert q("24", "bottle", "12", "fl oz", "packs") == "2 bottles"
      assert q("3", "case", "1", "oz", "packs") == "3 cases"
    end

    test "plural pack names" do
      assert Enum.map(~w(sack box bag pail jug bottle tub case each), &Units.plural/1) ==
               ~w(sacks boxes bags pails jugs bottles tubs cases each)

      assert Units.pack_word("box", 1) == "box" and Units.pack_word("box", 2) == "boxes"
    end

    test "each is whole numbers" do
      assert q("2600", "tub", "1000", "each", "packs") == "2 tubs 600 each"
      assert q("600.4", "tub", "1000", "each", "packs") == "600 each"
      assert q("600.6", "tub", "1000", "each", "lb") == "601 each"
      assert q("1000", "tub", "1000", "each", "packs") == "1 tub"
    end
  end

  describe "Units.quantity_display/1" do
    test "packs by default; the stored lb is the total" do
      assert Units.quantity_display(%{board_settings: %{}}) == "packs"

      assert Units.quantity_display(%{
               board_settings: %{"ingredients" => %{"quantity_display" => "packs"}}
             }) == "packs"

      assert Units.quantity_display(%{
               board_settings: %{"ingredients" => %{"quantity_display" => "lb"}}
             }) == "lb"
    end
  end

  describe "Products.display_name/1" do
    defp product(attrs) do
      struct(
        Product,
        Map.merge(
          %{
            manufacturer: %{name: "Yakima Chief"},
            ingredient: %{name: "Citra"},
            name: nil,
            form: nil
          },
          attrs
        )
      )
    end

    test "grain names are unchanged" do
      grain = %{manufacturer: %{name: "Rahr"}, ingredient: %{name: "2-Row"}}
      assert Products.display_name(product(grain)) == "Rahr 2-Row"

      assert Products.display_name(
               product(%{
                 manufacturer: %{name: "Weyermann"},
                 ingredient: %{name: "Beech Smoked Malt"},
                 name: "Rauch Malt"
               })
             ) == "Weyermann Rauch Malt (Beech Smoked Malt)"
    end

    test "a product with a form adds it after the ingredient" do
      assert Products.display_name(product(%{form: "T90 Pellet"})) ==
               "Yakima Chief Citra T90 Pellet"

      assert Products.display_name(
               product(%{
                 manufacturer: %{name: "Hopsteiner"},
                 form: "T90 Pellet",
                 name: "Lupomax"
               })
             ) == "Hopsteiner Citra T90 Pellet (Lupomax)"

      assert Products.display_name(
               product(%{
                 manufacturer: %{name: "Oregon Fruit"},
                 ingredient: %{name: "Strawberry"},
                 form: "Purée"
               })
             ) == "Oregon Fruit Strawberry Purée"
    end

    test "a product's unit; lb with none" do
      assert Products.unit(product(%{unit: "gal"})) == "gal"
      assert Products.unit(nil) == "lb"
    end
  end
end
