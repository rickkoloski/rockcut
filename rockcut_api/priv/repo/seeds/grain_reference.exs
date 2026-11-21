# D60 §6 and Appendix B: grain reference data on every environment — the
# maltsters (D62: the manufacturer role) and suppliers, one product per row
# with its standard specs, and the supplier offer it came from (a sack of
# its size in lb). No prices, lots or movements.
#
# Idempotent by name: a party, a product (grain + maltster, no product name)
# or an offer (product + supplier) that exists is left as it is, so edits
# made on the screens stick. Run from `priv/repo/seeds.exs`, after the
# grains, their categories and the feature types.
#
# Source: `grain_lots_raw` in the D28 seed (`git show 1694c09^:rockcut_api/
# priv/repo/seeds.exs`), 2026-crop lot values used as standards. The old lot
# numbers aren't used. Corrections (Appendix B), made in the rows below:
# "Dingmans" is Dingemans (maltster and order name); Brown Malt is Crisp,
# ordered as "Crisp - Brown Malt" (was "Simpsons - Brown Malt"); "RS" is
# Root Shoot.

import Ecto.Query, only: [from: 2]

alias RockcutApi.Repo
alias RockcutApi.Brewing.{Ingredient, IngredientCategory}

alias RockcutApi.Ingredients.{
  FeatureType,
  Party,
  PartyRole,
  Product,
  ProductFeatureValue,
  SupplierOffer
}

parties = [
  {"Rahr", ~w(manufacturer)},
  {"Root Shoot", ~w(manufacturer supplier)},
  {"Weyermann", ~w(manufacturer)},
  {"Simpsons", ~w(manufacturer)},
  {"Crisp", ~w(manufacturer)},
  {"Dingemans", ~w(manufacturer)},
  {"Grain Millers", ~w(manufacturer)},
  {"BSG", ~w(supplier)}
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

# {grain, maltster, supplier, moisture, extract FGDB, protein, color °L,
#  diastatic power °Lintner, order name, sack size lb}
rows = [
  {"2-Row", "Root Shoot", "Root Shoot", "3.30", "80.30", "11.50", "2.71", "124", nil, "50"},
  {"2-Row", "Rahr", "BSG", "4.70", "81.50", "11.00", "2.00", "154", "Rahr - Standard 2-row (milled)", "55"},
  {"Acidulated", "Weyermann", "BSG", "5.80", nil, nil, "2.10", "0", "Weyermann - Acidulated Malt", "55"},
  {"Barley, Roasted", "Simpsons", "BSG", "2.10", "62.00", nil, "552.10", "0", "Simpsons - Roasted Barley", "55"},
  {"Beech Smoked Malt", "Weyermann", "BSG", "4.50", "82.10", "10.40", "2.50", "0", "Weyermann - Rauch Malt", "55"},
  {"Biscuit", "Dingemans", "BSG", "3.54", "77.90", "11.50", "18.17", "0", "Dingemans - Biscuit", "55"},
  {"Black Malt", "Simpsons", "BSG", "3.00", "69.00", nil, "625.55", "0", "Simpsons - Black Malt", "55"},
  {"Brown Malt", "Crisp", "BSG", "3.00", "76.50", nil, "65.00", "0", "Crisp - Brown Malt", "55"},
  {"Carafa 3 - dehusked", "Weyermann", "BSG", "3.60", "72.30", nil, "528.30", "0", "Weyermann - Carafa 3 Special", "55"},
  {"Caramunich 1", "Weyermann", "BSG", "6.00", "77.60", nil, "34.40", "0", "Weyermann - Caramunich 1", "55"},
  {"Caramunich 2", "Weyermann", "BSG", "6.00", "77.20", nil, "45.70", "0", "Weyermann - Caramunich 2", "55"},
  {"Caramunich 3", "Weyermann", "BSG", "6.20", "75.90", nil, "57.00", "0", "Weyermann - Caramunich 3", "55"},
  {"CaraRed", "Weyermann", "BSG", "6.80", "76.60", nil, "20.10", "0", "Weyermann - CaraRed", "55"},
  {"CaraRuby", "Root Shoot", "Root Shoot", "4.10", "81.20", nil, "25.59", "70", nil, "50"},
  {"Chocolate Malt", "Simpsons", "BSG", "2.20", "69.00", nil, "408.50", "0", "Simpsons - Chocolate Malt", "55"},
  {"Crystal Dark (94L-107L)", "Simpsons", "BSG", "4.20", "69.00", nil, "100.10", "0", "Simpsons - Crystal Dark", "55"},
  {"Crystal Light (36L-43L)", "Simpsons", "BSG", "4.90", "69.00", nil, "42.30", "0", "Simpsons - Crystal Light", "55"},
  {"Crystal Medium (63L-72L)", "Simpsons", "BSG", "4.60", "69.00", nil, "65.70", "0", "Simpsons - Crystal Medium", "55"},
  {"Dextrin", "Crisp", "BSG", "5.30", "79.90", nil, "1.60", "95", "Crisp - Dextrin", "55"},
  {"English Pale", "Root Shoot", "Root Shoot", "3.20", "81.40", "10.50", "4.27", "130", nil, "50"},
  {"Honey Malt", "Root Shoot", "Root Shoot", "3.40", "80.50", "11.00", "32.69", "66", nil, "50"},
  {"Maris Otter", "Simpsons", "BSG", "2.90", "81.00", "8.91", "2.40", "62.70", "Simpsons - Maris Otter (milled)", "55"},
  {"Melanoidin Malt", "Weyermann", "BSG", "4.50", "77.90", nil, "28.70", "0", "Weyermann - Melanoidin Malt", "55"},
  {"Munich 4", "Root Shoot", "Root Shoot", "2.40", "80.40", "11.80", "4.04", "100", nil, "50"},
  {"Munich 10", "Root Shoot", "Root Shoot", "2.90", "80.50", "11.70", "10.13", "71", nil, "50"},
  {"Munich Barke", "Weyermann", "BSG", "4.00", "78.00", "10.50", "7.80", "70", "Weyermann - Munich Barke (milled)", "55"},
  {"Munich Malt 1", "Weyermann", "BSG", "4.50", "81.70", "10.40", "6.50", "70", "Weyermann - Munich 1 (milled)", "55"},
  {"Munich Malt 2", "Weyermann", "BSG", "3.90", "81.50", "10.60", "8.70", "25", "Weyermann - Munich 2 (milled)", "55"},
  {"Oats, Flaked", "Grain Millers", "BSG", "8.00", nil, "13.00", "1.50", "0", "Grain Millers - Rolled Oats", "50"},
  {"Oats, Malted", "Root Shoot", "Root Shoot", "2.20", "62.60", nil, "1.00", nil, nil, "50"},
  {"Pilsner", "Root Shoot", "Root Shoot", "5.00", "80.80", "10.50", "1.60", "125", nil, "50"},
  {"Pilsner", "Weyermann", "BSG", "3.90", "80.50", "10.75", "1.75", "110", "Weyermann - Pilsner (milled)", "55"},
  {"Pilsner", "Rahr", "BSG", "4.70", "81.50", "11.00", "2.00", "154", "Rahr to Thee - Pilsner (milled)", "55"},
  {"Pilsner-Barke", "Weyermann", "BSG", "3.90", "80.50", "10.75", "1.75", "110", "Weyermann - Pilsner Barke (milled)", "55"},
  {"Rye Malt", "Root Shoot", "Root Shoot", "4.20", "89.10", "10.00", "3.82", "125", nil, "50"},
  {"Rye Malt", "Weyermann", "BSG", "5.80", "83.00", nil, "2.30", "105", "Weyermann - Rye Malt (milled)", "55"},
  {"Special B", "Dingemans", "BSG", "3.58", "77.90", nil, "104.61", "0", "Dingemans - Special B", "55"},
  {"Vienna Malt", "Root Shoot", "Root Shoot", "3.30", "79.90", "11.90", "8.59", "71", nil, "50"},
  {"Vienna Malt", "Weyermann", "BSG", "5.50", "79.00", "11.00", "3.25", "70", "Weyermann - Vienna (milled)", "55"},
  {"Wheat, Extra Pale", "Rahr", "BSG", "4.50", "85.00", "12.00", "3.25", "190", "Rahr - Extra Pale White Wheat (milled)", "55"},
  {"Wheat, Torrified", "Crisp", "BSG", "10.00", "86.50", nil, "1.90", "0", "Crisp - Torrified Wheat (milled)", "55"},
  {"Wheat, Munich", "Root Shoot", "Root Shoot", "2.20", "82.40", "13.80", "5.99", "83", nil, "50"},
  {"Wheat, White", "Root Shoot", "Root Shoot", "3.80", "82.50", "13.70", "2.69", "138", nil, "50"},
  {"Wheat, White", "Rahr", "BSG", "4.50", "85.00", "12.00", "3.25", "190", "Rahr - White Wheat (milled)", "55"}
]

# Grains are on Grains or one of its children (Appendix A), by key (D62).
grain_category_ids = RockcutApi.Ingredients.Catalog.category_ids(["grains"])

grain_ids =
  Repo.all(
    from i in Ingredient,
      where: i.category_id in ^grain_category_ids,
      select: {i.name, i.id}
  )
  |> Map.new()

feature_ids = Repo.all(FeatureType) |> Map.new(fn f -> {f.key, f.id} end)

new_products =
  for {grain, maltster, supplier, moisture, fgdb, protein, color, diastatic, order_name, sack} <- rows,
      reduce: 0 do
    made ->
      case grain_ids[grain] do
        nil ->
          IO.puts("Grain reference: no grain named #{inspect(grain)}; skipped #{maltster}.")
          made

        grain_id ->
          manufacturer_id = party_ids[maltster]

          existing =
            Repo.one(
              from p in Product,
                where:
                  p.ingredient_id == ^grain_id and p.manufacturer_party_id == ^manufacturer_id and
                    is_nil(p.name)
            )

          {product, made} =
            case existing do
              %Product{} = product ->
                {product, made}

              nil ->
                product = Repo.insert!(%Product{ingredient_id: grain_id, manufacturer_party_id: manufacturer_id, unit: "lb"})

                # Blanks stay blank; a 0 diastatic power is a real 0.
                for {key, value} <- [
                      {"extract_fgdb", fgdb},
                      {"color_lovibond", color},
                      {"diastatic_power_lintner", diastatic},
                      {"protein_pct", protein},
                      {"moisture_pct", moisture}
                    ],
                    value != nil do
                  Repo.insert!(%ProductFeatureValue{
                    product_id: product.id,
                    feature_type_id: Map.fetch!(feature_ids, key),
                    value: Decimal.new(value)
                  })
                end

                {product, made + 1}
            end

          supplier_id = party_ids[supplier]

          unless Repo.exists?(
                   from o in SupplierOffer,
                     where: o.product_id == ^product.id and o.supplier_party_id == ^supplier_id
                 ) do
            Repo.insert!(%SupplierOffer{
              product_id: product.id,
              supplier_party_id: supplier_id,
              order_name: order_name,
              pack_name: "sack",
              pack_size: Decimal.new(sack),
              form: if(order_name && order_name =~ "(milled)", do: "milled", else: "whole")
            })
          end

          made
      end
  end

IO.puts("Grain reference: #{map_size(party_ids)} companies, #{new_products} new grain products")
