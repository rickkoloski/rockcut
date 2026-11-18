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
  Base child (the five grain features apply to Grains), Hops (alpha acid);
  Rahr (maltster), BSG (supplier), Root Shoot (both), Mountain Brewing
  (partner brewery); grain 2-Row with product Rahr 2-Row (standard extract
  81.5, color 2.0) and a BSG offer of 55 lb sacks.
  """
  def grain_catalog! do
    grains = Repo.insert!(%IngredientCategory{name: "Grains", sort_order: 0})
    base = Repo.insert!(%IngredientCategory{name: "Base", sort_order: 0, parent_id: grains.id})
    hops = Repo.insert!(%IngredientCategory{name: "Hops", sort_order: 1})

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

    rahr = party!("Rahr", ~w(maltster))
    bsg = party!("BSG", ~w(supplier))
    root_shoot = party!("Root Shoot", ~w(maltster supplier))
    mountain = party!("Mountain Brewing", ~w(partner_brewery))

    two_row = Repo.insert!(%Ingredient{name: "2-Row", category_id: base.id})
    product = product!(two_row, rahr, extract_fgdb: "81.5", color_lovibond: "2.0")

    offer =
      Repo.insert!(%SupplierOffer{
        product_id: product.id,
        supplier_party_id: bsg.id,
        order_name: "Rahr - Standard 2-row (milled)",
        sack_size_lb: Decimal.new(55),
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

  def party!(name, roles) do
    party = Repo.insert!(%Party{name: name})
    for role <- roles, do: Repo.insert!(%PartyRole{party_id: party.id, role: role})
    party
  end

  def product!(ingredient, maltster, features \\ [], name \\ nil) do
    product =
      Repo.insert!(%Product{
        ingredient_id: ingredient.id,
        maltster_party_id: maltster.id,
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

  @doc "A lot of `product` received `received` with an opening amount of `lb`."
  def stocked_lot!(product, received, lb, lot_number \\ nil) do
    lot =
      Repo.insert!(%IngredientLot{
        ingredient_id: product.ingredient_id,
        product_id: product.id,
        lot_number: lot_number,
        received_date: received,
        sack_size_lb: Decimal.new(55)
      })

    Repo.insert!(%Movement{
      lot_id: lot.id,
      kind: "opening",
      quantity_lb: Decimal.new(lb),
      occurred_on: received
    })

    lot
  end
end
