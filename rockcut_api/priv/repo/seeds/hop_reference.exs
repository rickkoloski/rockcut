# D62 §7 and the hop Amendments: hop reference data on every environment —
# the hop companies (manufacturer = supplier for this seed; Matt corrects
# growers on the screens), one product per manufacturer + variety + form
# with its typical alpha / beta / oil ranges and origin, one offer each
# (box · 11 lb, ordered by the variety's name, no price), and Matt's cooler
# list as lots with an Opening amount dated 2026-11-19.
#
# Idempotent by name: a party, a hop (variety), a product (variety +
# manufacturer + form, no product name) or an offer (product + supplier)
# that exists is left as it is, so edits made on the screens stick. A lot
# already there (same product, same lot # in any case) is skipped and
# never topped up. Run from `priv/repo/seeds.exs`, after the grain
# reference (BSG is there already) and the feature types.
#
# Source: `docs/current_work/reference/d62_hop_products.csv` (27 products,
# ranges checked by Matt; Pink Boots has none) and
# `d62_hops_matt_2026-11-19.csv` (29 rows; EKG is in the D63 reference). Both
# are git-excluded, so the rows are copied here. Variety names drop the crop
# labels ("Cascade (23)" is Cascade); "Hallertau Mittelfrueh" is Hallertau
# Mittelfrüh. "Pink Boots" is one variety per year, '23 and '24 (D63 §5.5), so
# the rows here are 28 products. Citra (24-cryo) is the Cryo product, every
# other lot T90 Pellet.

import Ecto.Query, only: [from: 2]

alias RockcutApi.Repo
alias RockcutApi.Brewing.{Ingredient, IngredientLot}

alias RockcutApi.Ingredients.{
  Catalog,
  FeatureType,
  LotFeatureValue,
  Movement,
  Party,
  PartyRole,
  Product,
  ProductFeatureValue,
  SupplierOffer,
  UseOrder
}

parties = [
  {"John Fearless", ~w(manufacturer supplier)},
  {"Lupulin Exchange", ~w(manufacturer supplier)},
  {"Billy Goat", ~w(manufacturer supplier)},
  {"Michigan Hop Alliance", ~w(manufacturer supplier)},
  {"Yakima Chief Hops", ~w(manufacturer supplier)},
  {"BSG", ~w(manufacturer supplier)}
]

party_ids =
  Map.new(parties, fn {name, roles} ->
    party = Repo.get_by(Party, name: name) || Repo.insert!(%Party{name: name})

    for role <- roles do
      Repo.insert!(%PartyRole{party_id: party.id, role: role},
        on_conflict: :nothing,
        conflict_target: [:party_id, :role]
      )
    end

    {name, party.id}
  end)

# {variety, manufacturer and supplier, form, origin,
#  alpha low, alpha high, beta low, beta high, oil low, oil high}
products = [
  {"African Queen", "John Fearless", "T90 Pellet", "South Africa", "10.0", "17.0", "4.0", "6.5",
   "1.0", "1.6"},
  {"Cascade", "Lupulin Exchange", "T90 Pellet", "USA", "4.5", "7.0", "4.5", "7.0", "0.7", "1.4"},
  {"Cashmere", "Lupulin Exchange", "T90 Pellet", "USA", "7.7", "9.1", "6.4", "7.1", "1.2", "1.4"},
  {"Chinook", "Lupulin Exchange", "T90 Pellet", "USA", "12.0", "14.0", "3.0", "4.0", "1.5",
   "2.5"},
  {"Chinook", "Billy Goat", "T90 Pellet", "USA", "12.0", "14.0", "3.0", "4.0", "1.5", "2.5"},
  {"Citra", "Lupulin Exchange", "T90 Pellet", "USA", "11.0", "13.0", "3.5", "4.5", "1.5", "3.0"},
  {"Citra", "Lupulin Exchange", "Cryo", "USA", "20.0", "26.0", "5.0", "8.0", "3.0", "5.0"},
  {"Columbus", "Lupulin Exchange", "T90 Pellet", "USA", "14.0", "16.0", "4.5", "5.5", "2.0",
   "3.0"},
  {"Comet", "Billy Goat", "T90 Pellet", "USA", "9.4", "12.4", "3.0", "6.1", "1.0", "3.0"},
  {"El Dorado", "Lupulin Exchange", "T90 Pellet", "USA", "14.0", "16.0", "7.0", "8.0", "2.5",
   "3.3"},
  {"Galaxy", "Lupulin Exchange", "T90 Pellet", "Australia", "11.0", "16.0", "5.0", "6.9", "2.4",
   "4.0"},
  {"Hallertau Blanc", "Yakima Chief Hops", "T90 Pellet", "Germany", "9.0", "12.0", "4.5", "6.0",
   "0.8", "1.5"},
  {"Hallertau Mittelfrüh", "Lupulin Exchange", "T90 Pellet", "Germany", "3.0", "5.5", "3.0",
   "5.0", "0.5", "1.0"},
  {"Hersbrucker", "Lupulin Exchange", "T90 Pellet", "Germany", "1.5", "4.0", "2.5", "6.0", "0.5",
   "1.3"},
  {"Lemon Drop", "Lupulin Exchange", "T90 Pellet", "USA", "5.0", "7.0", "4.0", "6.0", "1.5",
   "2.0"},
  {"Magnum", "Lupulin Exchange", "T90 Pellet", "Germany", "11.0", "16.0", "5.0", "7.0", "1.6",
   "2.6"},
  {"Mosaic", "Lupulin Exchange", "T90 Pellet", "USA", "11.5", "13.5", "3.2", "3.9", "1.0", "1.5"},
  {"Motueka", "Lupulin Exchange", "T90 Pellet", "New Zealand", "6.5", "7.5", "5.0", "5.5", "0.6",
   "1.0"},
  {"Nectaron", "Lupulin Exchange", "T90 Pellet", "New Zealand", "10.5", "12.0", "4.4", "4.7",
   "1.5", "2.4"},
  {"Nelson Sauvin", "Lupulin Exchange", "T90 Pellet", "New Zealand", "12.0", "13.0", "6.0", "8.0",
   "1.0", "1.2"},
  {"Northern Brewer", "Lupulin Exchange", "T90 Pellet", "Germany", "6.0", "10.0", "3.0", "5.0",
   "1.5", "2.0"},
  {"Pink Boots '23", "Yakima Chief Hops", "T90 Pellet", "USA", nil, nil, nil, nil, nil, nil},
  {"Pink Boots '24", "Yakima Chief Hops", "T90 Pellet", "USA", nil, nil, nil, nil, nil, nil},
  {"Rakau", "Michigan Hop Alliance", "T90 Pellet", "New Zealand", "10.0", "11.0", "5.0", "6.0",
   "2.0", "2.2"},
  {"Saaz", "BSG", "T90 Pellet", "Czech Republic", "2.5", "4.5", "4.0", "6.0", "0.4", "0.8"},
  {"Saphir", "Lupulin Exchange", "T90 Pellet", "Germany", "2.0", "4.5", "4.0", "7.0", "0.8",
   "1.4"},
  {"Simcoe", "Lupulin Exchange", "T90 Pellet", "USA", "12.0", "14.0", "4.0", "5.0", "2.0", "2.5"},
  {"Tettnang", "Lupulin Exchange", "T90 Pellet", "Germany", "3.5", "5.5", "3.5", "5.0", "0.5",
   "0.9"}
]

# Matt's cooler list, 2026-11-19: {variety, supplier (= manufacturer),
# form, lot #, crop year, alpha %, on hand lb}. Alpha has 2 decimals as
# given (12.67, 15.40, 7.90).
lots = [
  {"African Queen", "John Fearless", "T90 Pellet", "20P2026", 2020, "11.3", "3.5"},
  {"Cascade", "Lupulin Exchange", "T90 Pellet", "11323399203", 2023, "6.4", "3.7"},
  {"Cashmere", "Lupulin Exchange", "T90 Pellet", "HD-CASH23", 2023, "8.7", "17.5"},
  {"Chinook", "Lupulin Exchange", "T90 Pellet", "CHI-1306-360", 2023, "12.5", "2.0"},
  {"Chinook", "Billy Goat", "T90 Pellet", "BG-Chin-2025", 2025, "12.67", "3.0"},
  {"Citra", "Lupulin Exchange", "Cryo", "PC1-JUCIT2206", 2024, "26.9", "8.2"},
  {"Citra", "Lupulin Exchange", "T90 Pellet", "P92-LUCIT6110", 2026, "13.9", "11.0"},
  {"Columbus", "Lupulin Exchange", "T90 Pellet", "CBS25W526", 2025, "15.40", "38.4"},
  {"Comet", "Billy Goat", "T90 Pellet", "BG-Come-2025", 2025, "10.54", "8.0"},
  {"El Dorado", "Lupulin Exchange", "T90 Pellet", "25-WA405-058", 2025, "11.0", "10.2"},
  {"Galaxy", "Lupulin Exchange", "T90 Pellet", "MB030", 2025, "17.6", "71.0"},
  {"Hallertau Blanc", "Yakima Chief Hops", "T90 Pellet", "19-620", 2019, "8.2", "28.6"},
  {"Hallertau Mittelfrüh", "Lupulin Exchange", "T90 Pellet", "OHZT-25-0057", 2025, "3.1", "27.6"},
  {"Hersbrucker", "Lupulin Exchange", "T90 Pellet", "24-0005", 2024, "3.1", "6.0"},
  {"Lemon Drop", "Lupulin Exchange", "T90 Pellet", "25P0090", 2025, "5.9", "7.0"},
  {"Magnum", "Lupulin Exchange", "T90 Pellet", "ERH.MAG.20241209", 2024, "7.90", "0.6"},
  {"Mosaic", "Lupulin Exchange", "T90 Pellet", "MOS-P-11-2769", 2023, "13.0", "18.6"},
  {"Motueka", "Lupulin Exchange", "T90 Pellet", "25-318", 2025, "7.6", "2.8"},
  {"Nectaron", "Lupulin Exchange", "T90 Pellet", "24-492", 2024, "14.1", "7.0"},
  {"Nelson Sauvin", "Lupulin Exchange", "T90 Pellet", "P92-HNNEL2005", 2022, "11.7", "11.0"},
  {"Northern Brewer", "Lupulin Exchange", "T90 Pellet", "OHZT-25-0088", 2025, "7.90", "20.6"},
  {"Pink Boots '23", "Yakima Chief Hops", "T90 Pellet", "P92-IUPBB3182", 2023, "12.5", "8.5"},
  {"Pink Boots '24", "Yakima Chief Hops", "T90 Pellet", "P92-JUPBB4199", 2024, "14.2", "2.9"},
  {"Rakau", "Michigan Hop Alliance", "T90 Pellet", "PM21-L008-RKU", 2021, "9.8", "11.0"},
  {"Saaz", "BSG", "T90 Pellet", "BSG-SAAZ-23", 2023, "2.5", "14.6"},
  {"Saphir", "Lupulin Exchange", "T90 Pellet", "OHZT-25-0023", 2025, "3.9", "33.1"},
  {"Simcoe", "Lupulin Exchange", "T90 Pellet", "23-Sim2", 2023, "14.6", "25.1"},
  {"Tettnang", "Lupulin Exchange", "T90 Pellet", "OHZT-25-0031", 2025, "3.8", "8.1"}
]

[hops_category_id] = Catalog.category_ids(["hops"])
{pack_name, pack_size} = Catalog.fixed_pack("hops")
feature_ids = Repo.all(FeatureType) |> Map.new(fn f -> {f.key, f.id} end)

# Hops has no children: a variety is the ingredient of that name on Hops.
# D63 §5.5: Pink Boots is one variety per year. When its migration left Pink
# Boots Blend alone, or left the 2024 lot with '23, the year's variety and lot
# aren't added: the lot is on another hop already.
hop_exists? = fn name ->
  Repo.exists?(
    from i in Ingredient,
      where:
        i.category_id == ^hops_category_id and
          fragment("lower(?)", i.name) == ^String.downcase(name)
  )
end

lot_elsewhere? = fn number, variety ->
  Repo.exists?(
    from l in IngredientLot,
      join: i in Ingredient,
      on: i.id == l.ingredient_id,
      where:
        i.category_id == ^hops_category_id and i.name != ^variety and
          fragment("lower(?)", l.lot_number) == ^String.downcase(number)
  )
end

skipped =
  for {variety, number} <- [
        {"Pink Boots '23", "P92-IUPBB3182"},
        {"Pink Boots '24", "P92-JUPBB4199"}
      ],
      hop_exists?.("Pink Boots Blend") or lot_elsewhere?.(number, variety),
      do: variety

products = Enum.reject(products, &(elem(&1, 0) in skipped))
lots = Enum.reject(lots, &(elem(&1, 0) in skipped))

# The supplier's own name, when it isn't the variety's (D63 §5.5).
order_names = %{"Pink Boots '23" => "Pink Boots Blend", "Pink Boots '24" => "Pink Boots Blend"}

hop_ids =
  products
  |> Enum.map(&elem(&1, 0))
  |> Enum.uniq()
  |> Map.new(fn variety ->
    hop =
      Repo.get_by(Ingredient, name: variety, category_id: hops_category_id) ||
        Repo.insert!(%Ingredient{name: variety, category_id: hops_category_id})

    {variety, hop.id}
  end)

{product_ids, new_products} =
  for {variety, company, form, origin, alpha_low, alpha_high, beta_low, beta_high, oil_low,
       oil_high} <- products,
      reduce: {%{}, 0} do
    {ids, made} ->
      hop_id = hop_ids[variety]
      company_id = party_ids[company]

      existing =
        Repo.one(
          from p in Product,
            where:
              p.ingredient_id == ^hop_id and p.manufacturer_party_id == ^company_id and
                p.form == ^form and is_nil(p.name)
        )

      {product, made} =
        case existing do
          %Product{} = product ->
            {product, made}

          nil ->
            product =
              Repo.insert!(%Product{
                ingredient_id: hop_id,
                manufacturer_party_id: company_id,
                unit: "lb",
                form: form,
                origin: origin
              })

            # Pink Boots has no published range: no rows at all.
            for {key, low, high} <- [
                  {"alpha_acid_pct", alpha_low, alpha_high},
                  {"beta_acid_pct", beta_low, beta_high},
                  {"total_oil_ml_100g", oil_low, oil_high}
                ],
                low != nil or high != nil do
              Repo.insert!(%ProductFeatureValue{
                product_id: product.id,
                feature_type_id: Map.fetch!(feature_ids, key),
                value: low && Decimal.new(low),
                value_high: high && Decimal.new(high)
              })
            end

            {product, made + 1}
        end

      unless Repo.exists?(
               from o in SupplierOffer,
                 where: o.product_id == ^product.id and o.supplier_party_id == ^company_id
             ) do
        Repo.insert!(%SupplierOffer{
          product_id: product.id,
          supplier_party_id: company_id,
          order_name: Map.get(order_names, variety, variety),
          pack_name: pack_name,
          pack_size: pack_size,
          # Milled/whole is grain's; a hop offer has no form (lead decisions 1, gap 3).
          form: nil
        })
      end

      {Map.put(ids, {variety, company, form}, product.id), made}
  end

alpha_id = Map.fetch!(feature_ids, "alpha_acid_pct")
counted_on = ~D[2026-11-19]

new_lots =
  for {variety, company, form, number, crop_year, alpha, lb} <- lots, reduce: 0 do
    made ->
      product_id = Map.fetch!(product_ids, {variety, company, form})

      if RockcutApi.Ingredients.Inventory.find_lot(product_id, number) do
        made
      else
        lot =
          UseOrder.insert_lot!(%IngredientLot{
            ingredient_id: hop_ids[variety],
            product_id: product_id,
            supplier_party_id: party_ids[company],
            lot_number: number,
            crop_year: crop_year,
            received_date: counted_on,
            pack_name: pack_name,
            pack_size: pack_size
          })

        Repo.insert!(%LotFeatureValue{
          lot_id: lot.id,
          feature_type_id: alpha_id,
          value: Decimal.new(alpha)
        })

        Repo.insert!(%Movement{
          lot_id: lot.id,
          kind: "opening",
          quantity: Decimal.new(lb),
          occurred_on: counted_on
        })

        made + 1
      end
  end

IO.puts(
  "Hop reference: #{map_size(party_ids)} companies, #{new_products} new hop products, " <>
    "#{new_lots} new hop lots"
)
