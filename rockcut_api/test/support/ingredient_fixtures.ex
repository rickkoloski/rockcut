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
  Base child (the five grain features apply to Grains), Hops (alpha acid),
  each top-level one with its D62 key; Rahr (manufacturer, the maltster),
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

    Repo.insert!(%CategoryFeatureType{
      category_id: hops.id,
      feature_type_id: feature_type!("alpha_acid_pct").id
    })

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
end
