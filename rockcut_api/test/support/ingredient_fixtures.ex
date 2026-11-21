defmodule RockcutApi.IngredientFixtures do
  @moduledoc """
  D60: feature values for lots. The feature types themselves come from the
  `copy_lot_specs_to_features` migration, so every test database has them.
  """
  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{Ingredient, IngredientCategory, IngredientLot}

  alias RockcutApi.Ingredients.{
    CategoryFeatureType,
    FeatureType,
    LotFeatureValue,
    Movement,
    OfferPrice,
    Party,
    PartyRole,
    Product,
    ProductFeatureValue,
    SupplierOffer
  }

  @grain_features ~w(extract_fgdb color_lovibond diastatic_power_lintner protein_pct moisture_pct)

  def feature_type!(key), do: Repo.get_by!(FeatureType, key: key)

  @doc "D62 lead decisions 1, gap 9: a product's version, as an Edit dialog sends it back."
  def product_version(id), do: Repo.get!(Product, id).lock_version

  @doc "Sets `lot`'s value for each `{feature key, value}`; returns the lot."
  def lot_features!(lot, values) do
    for {key, value} <- values do
      Repo.insert!(%LotFeatureValue{
        lot_id: lot.id,
        feature_type_id: feature_type!(to_string(key)).id,
        value: Decimal.new(value)
      })
    end

    lot
  end

  @doc """
  D60 Stage 2: a small grain catalog as the seeds make it. Grains with a
  Base child (the five grain features apply to Grains), Hops (D62 §3.4:
  alpha, beta and oil as ranges on the product, entered on each lot, alpha
  required), each top-level one with its D62 key; Rahr (manufacturer, the maltster),
  BSG (supplier), Root Shoot (both), Mountain Brewing
  (partner brewery); grain 2-Row with product Rahr 2-Row (standard extract
  81.5, color 2.0) and a BSG offer of 55 lb sacks.
  """
  def grain_catalog! do
    grains = Repo.insert!(%IngredientCategory{name: "Grains", key: "grains", sort_order: 0})
    base = Repo.insert!(%IngredientCategory{name: "Base", sort_order: 0, parent_id: grains.id})
    hops = Repo.insert!(%IngredientCategory{name: "Hops", key: "hops", sort_order: 1})

    for {key, i} <- Enum.with_index(@grain_features) do
      Repo.insert!(%CategoryFeatureType{
        category_id: grains.id,
        feature_type_id: feature_type!(key).id,
        sort_order: i
      })
    end

    for {key, i} <- Enum.with_index(~w(alpha_acid_pct beta_acid_pct total_oil_ml_100g)) do
      Repo.insert!(%CategoryFeatureType{
        category_id: hops.id,
        feature_type_id: feature_type!(key).id,
        sort_order: i,
        product_mode: "range",
        lot_mode: "enter",
        lot_required: key == "alpha_acid_pct"
      })
    end

    rahr = party!("Rahr", ~w(manufacturer))
    bsg = party!("BSG", ~w(supplier))
    root_shoot = party!("Root Shoot", ~w(manufacturer supplier))
    mountain = party!("Mountain Brewing", ~w(partner_brewery))

    two_row = Repo.insert!(%Ingredient{name: "2-Row", category_id: base.id})
    product = product!(two_row, rahr, extract_fgdb: "81.5", color_lovibond: "2.0")

    offer =
      Repo.insert!(%SupplierOffer{
        product_id: product.id,
        supplier_party_id: bsg.id,
        order_name: "Rahr - Standard 2-row (milled)",
        pack_name: "sack",
        pack_size: Decimal.new(55),
        form: "milled"
      })

    %{
      grains: grains,
      base: base,
      hops: hops,
      rahr: rahr,
      bsg: bsg,
      root_shoot: root_shoot,
      mountain: mountain,
      two_row: two_row,
      product: product,
      offer: offer
    }
  end

  @doc """
  D62 Stage 2: on `grain_catalog!/0`'s Hops, Yakima Chief Hops (manufacturer
  and supplier), hop Citra and its product YCH Citra T90 Pellet (alpha
  11–13, beta 3.5–4.5, oil 2.5–3), and a YCH offer of 11 lb boxes.
  """
  def hop_catalog!(c) do
    ych = party!("Yakima Chief Hops", ~w(manufacturer supplier))
    citra = Repo.insert!(%Ingredient{name: "Citra", category_id: c.hops.id})

    product =
      Repo.insert!(%Product{
        ingredient_id: citra.id,
        manufacturer_party_id: ych.id,
        form: "T90 Pellet",
        origin: "USA"
      })

    for {key, low, high} <- [
          {"alpha_acid_pct", "11", "13"},
          {"beta_acid_pct", "3.5", "4.5"},
          {"total_oil_ml_100g", "2.5", "3"}
        ] do
      Repo.insert!(%ProductFeatureValue{
        product_id: product.id,
        feature_type_id: feature_type!(key).id,
        value: Decimal.new(low),
        value_high: Decimal.new(high)
      })
    end

    offer =
      Repo.insert!(%SupplierOffer{
        product_id: product.id,
        supplier_party_id: ych.id,
        pack_name: "box",
        pack_size: Decimal.new(11),
        form: nil
      })

    %{ych: ych, citra: citra, hop_product: product, hop_offer: offer}
  end

  @doc "D62: a hop lot of `product` (11 lb boxes) with `alpha`, crop year and an opening amount."
  def hop_lot!(product, received, quantity, alpha, lot_number \\ nil, crop_year \\ 2025) do
    lot =
      Repo.insert!(%IngredientLot{
        ingredient_id: product.ingredient_id,
        product_id: product.id,
        lot_number: lot_number,
        received_date: received,
        crop_year: crop_year,
        pack_name: "box",
        pack_size: Decimal.new(11)
      })

    lot_features!(lot, alpha_acid_pct: alpha)

    Repo.insert!(%Movement{
      lot_id: lot.id,
      kind: "opening",
      quantity: Decimal.new(quantity),
      occurred_on: received
    })

    lot
  end

  @doc """
  D62: a top-level category with its key (`Ingredients.Catalog` reads the
  key, never the name; the API doesn't set keys).
  """
  def keyed_category!(name, key),
    do: Repo.insert!(%IngredientCategory{name: name, key: key})

  def party!(name, roles) do
    party = Repo.insert!(%Party{name: name})
    for role <- roles, do: Repo.insert!(%PartyRole{party_id: party.id, role: role})
    party
  end

  def product!(ingredient, manufacturer, features \\ [], name \\ nil) do
    product =
      Repo.insert!(%Product{
        ingredient_id: ingredient.id,
        manufacturer_party_id: manufacturer.id,
        name: name
      })

    for {key, value} <- features do
      Repo.insert!(%ProductFeatureValue{
        product_id: product.id,
        feature_type_id: feature_type!(to_string(key)).id,
        value: Decimal.new(value)
      })
    end

    product
  end

  @doc "A lot of `product` (55 lb sacks) received `received` with an opening amount of `quantity`."
  def stocked_lot!(product, received, quantity, lot_number \\ nil) do
    lot =
      Repo.insert!(%IngredientLot{
        ingredient_id: product.ingredient_id,
        product_id: product.id,
        lot_number: lot_number,
        received_date: received,
        pack_name: "sack",
        pack_size: Decimal.new(55)
      })

    Repo.insert!(%Movement{
      lot_id: lot.id,
      kind: "opening",
      quantity: Decimal.new(quantity),
      occurred_on: received
    })

    lot
  end

  @doc "D61: an offer of `product` by `supplier` in `size` lb sacks, with a price from `on` when given."
  def offer!(product, supplier, size \\ "55", price \\ nil, on \\ ~D[2000-01-01]) do
    offer =
      Repo.insert!(%SupplierOffer{
        product_id: product.id,
        supplier_party_id: supplier.id,
        pack_name: "sack",
        pack_size: Decimal.new(size),
        form: "whole"
      })

    if price, do: price!(offer, price, on)
    offer
  end

  @doc "D61: a price row on `offer`, effective `on`."
  def price!(offer, price, on \\ ~D[2000-01-01]) do
    Repo.insert!(%OfferPrice{
      offer_id: offer.id,
      price_per_pack: Decimal.new(price),
      effective_on: on
    })
  end

  @doc """
  D65: on `grain_catalog!/0`'s data, the four D65 categories (Other
  Consumables with Water Salts and Finings), the ingredients Strawberry,
  Cinnamon, Vanilla Extract, Dextrose (Corn Sugar), Black Strap Molasses,
  Calcium Sulfate (Gypsum) and Whirlfloc, and Oregon Fruit (manufacturer).
  """
  def d65_catalog! do
    fruits = keyed_category!("Fruits", "fruits")
    spices = keyed_category!("Spices & Flavorings", "spices")
    sugars = keyed_category!("Sugars and Extracts", "sugars")
    consumables = keyed_category!("Other Consumables", "consumables")
    salts = Repo.insert!(%IngredientCategory{name: "Water Salts", parent_id: consumables.id})
    finings = Repo.insert!(%IngredientCategory{name: "Finings", parent_id: consumables.id})
    ingredient = &Repo.insert!(%Ingredient{name: &1, category_id: &2.id})

    # D65 Stop 2 (migration `d65_features_and_pack_note`'s rows): Fruits'
    # Brix a range, entered on lots; Sugars' extract a standard copied to
    # lots, Brix on Liquid lots only.
    for {category, key, sort, product_mode, lot_mode, only_form} <- [
          {fruits, "brix", 0, "range", "enter", nil},
          {sugars, "extract_fgdb", 0, "value", "copy", nil},
          {sugars, "brix", 1, "none", "enter", "Liquid"}
        ] do
      Repo.insert!(%CategoryFeatureType{
        category_id: category.id,
        feature_type_id: feature_type!(key).id,
        sort_order: sort,
        product_mode: product_mode,
        lot_mode: lot_mode,
        only_form: only_form
      })
    end

    %{
      fruits: fruits,
      spices: spices,
      sugars: sugars,
      consumables: consumables,
      salts: salts,
      finings: finings,
      strawberry: ingredient.("Strawberry", fruits),
      cinnamon: ingredient.("Cinnamon", spices),
      vanilla: ingredient.("Vanilla Extract", spices),
      dextrose: ingredient.("Dextrose (Corn Sugar)", sugars),
      molasses: ingredient.("Black Strap Molasses", sugars),
      gypsum: ingredient.("Calcium Sulfate (Gypsum)", salts),
      whirlfloc: ingredient.("Whirlfloc", finings),
      oregon: party!("Oregon Fruit", ~w(manufacturer))
    }
  end

  @doc "D65: a product with no manufacturer (stored directly, as the API makes one)."
  def none_product!(ingredient, form, unit, name \\ nil),
    do: Repo.insert!(%Product{ingredient_id: ingredient.id, form: form, unit: unit, name: name})
end
