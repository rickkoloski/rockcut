# D65 §7 and the reference-data amendments (salts batch 1, sugars batch 2,
# fruit batches 3 and 3b, finings batch 4, spices batch 5): reference data
# on every environment. No lots: Matt gave no on-hand amounts.
#
# Idempotent and matched by name, ignoring case: a company, an ingredient
# (in its category or child), a product (ingredient + manufacturer, None
# included + form + product name), an offer (product + supplier + pack) or a
# price (offer + 2026-11-20) that exists is left as it is, so edits made on
# the screens stick. An existing ingredient gets a formula or an ion value
# only where it has none. Run from `priv/repo/seeds.exs`, after the hop
# reference (BSG is there already) and the D65 migrations (Water Salts,
# Process Aids, "Dextrose (Corn Sugar)", the Brix, extract and ion feature types).
#
# Source: the git-excluded `docs/current_work/reference/d65_*_matt_2026-11-20.csv`,
# copied here. Names are the spec amendments' (the CSVs hold Matt's raw
# input: "Gypsum (Hydrous)" is Calcium Sulfate (Gypsum), "Honey - Redstone"
# is Honey from Colorado Honey Co. supplied by Redstone, "Tangereen" is
# Tangerine). D63 §5.3, §5.4: the corrected values, and calcium chloride's
# product is Anhydrous's. Belgian Candy Syrup 70 % is a typical value
# for Matt to check (sugars amendment, decision 3).

import Ecto.Query, only: [from: 2]

alias RockcutApi.Repo
alias RockcutApi.Brewing.{Ingredient, IngredientCategory}

alias RockcutApi.Ingredients.{
  FeatureType,
  IngredientFeatureValue,
  OfferPrice,
  Party,
  PartyRole,
  Product,
  ProductFeatureValue,
  SupplierOffer
}

effective = ~D[2026-11-20]
now = DateTime.utc_now() |> DateTime.truncate(:second)

# ── Companies ───────────────────────────────────────────────────────────
parties = [
  {"Candico", ~w(manufacturer)},
  {"Sweetener Sup Co.", ~w(manufacturer)},
  {"Colorado Honey Co.", ~w(manufacturer)},
  {"Muntons", ~w(manufacturer)},
  {"Redstone", ~w(supplier)},
  {"SoNature", ~w(supplier)},
  {"Aseptic Fruit", ~w(manufacturer supplier)},
  {"BSG", ~w(supplier)}
]

party_ids =
  Map.new(parties, fn {name, roles} ->
    party =
      Repo.one(from p in Party, where: fragment("lower(?)", p.name) == ^String.downcase(name)) ||
        Repo.insert!(%Party{name: name})

    for role <- roles do
      Repo.insert!(%PartyRole{party_id: party.id, role: role},
        on_conflict: :nothing,
        conflict_target: [:party_id, :role]
      )
    end

    {name, party.id}
  end)

# ── Categories ──────────────────────────────────────────────────────────
top = fn key -> Repo.one(from c in IngredientCategory, where: c.key == ^key, select: c.id) end

child = fn name ->
  parent = top.("consumables")

  parent &&
    Repo.one(
      from c in IngredientCategory,
        where: c.parent_id == ^parent and fragment("lower(?)", c.name) == ^String.downcase(name),
        select: c.id
    )
end

category_ids = %{
  fruits: top.("fruits"),
  spices: top.("spices"),
  sugars: top.("sugars"),
  consumables: top.("consumables"),
  salts: child.("Water Salts"),
  process_aids: child.("Process Aids")
}

missing = for {k, nil} <- category_ids, do: k

if missing != [] do
  raise "D65 reference: categories not found (#{Enum.join(missing, ", ")}); run the D65 migrations first"
end

# An ingredient by name (any case) in `category`, or (for Whirlfloc) any of
# `also`; created in `category` when there's none. {id, new?}
ingredient = fn name, category, also ->
  ids = [category | also]

  case Repo.one(
         from i in Ingredient,
           where:
             i.category_id in ^ids and fragment("lower(?)", i.name) == ^String.downcase(name),
           limit: 1
       ) do
    %Ingredient{} = i -> {i, false}
    nil -> {Repo.insert!(%Ingredient{name: name, category_id: category}), true}
  end
end

feature_ids = Repo.all(FeatureType) |> Map.new(fn f -> {f.key, f.id} end)

# A product of `ingredient_id` (manufacturer nil = None); its standard or
# range written only when the product is new. {id, new?}
product = fn ingredient_id, maker, form, unit, name, features ->
  maker_id = maker && Map.fetch!(party_ids, maker)

  query =
    from p in Product,
      where: p.ingredient_id == ^ingredient_id and p.form == ^form,
      limit: 1

  query =
    if maker_id,
      do: from(p in query, where: p.manufacturer_party_id == ^maker_id),
      else: from(p in query, where: is_nil(p.manufacturer_party_id))

  query =
    if name,
      do: from(p in query, where: p.name == ^name),
      else: from(p in query, where: is_nil(p.name))

  case Repo.one(query) do
    %Product{} = p ->
      {p.id, false}

    nil ->
      p =
        Repo.insert!(%Product{
          ingredient_id: ingredient_id,
          manufacturer_party_id: maker_id,
          form: form,
          unit: unit,
          name: name
        })

      for {key, low, high} <- features do
        Repo.insert!(%ProductFeatureValue{
          product_id: p.id,
          feature_type_id: Map.fetch!(feature_ids, key),
          value: low && Decimal.new(low),
          value_high: high && Decimal.new(high)
        })
      end

      {p.id, true}
  end
end

# An offer (product + supplier + pack), and its 2026-11-20 price when given.
# {new offer?, new price?}
offer = fn product_id, supplier, pack, size, note, price ->
  supplier_id = Map.fetch!(party_ids, supplier)
  size = Decimal.new(size)

  existing =
    Repo.all(
      from o in SupplierOffer,
        where:
          o.product_id == ^product_id and o.supplier_party_id == ^supplier_id and
            o.pack_name == ^pack
    )
    |> Enum.find(&Decimal.eq?(&1.pack_size, size))

  {o, new_offer?} =
    case existing do
      %SupplierOffer{} = o ->
        {o, false}

      nil ->
        {Repo.insert!(%SupplierOffer{
           product_id: product_id,
           supplier_party_id: supplier_id,
           pack_name: pack,
           pack_size: size,
           pack_note: note,
           # Milled/whole is grain's alone.
           form: nil
         }), true}
    end

  new_price? =
    price != nil and
      not Repo.exists?(
        from p in OfferPrice, where: p.offer_id == ^o.id and p.effective_on == ^effective
      )

  if new_price? do
    Repo.insert!(%OfferPrice{
      offer_id: o.id,
      price_per_pack: Decimal.new(price),
      effective_on: effective
    })
  end

  {new_offer?, new_price?}
end

tally = fn
  acc, key, true -> Map.update!(acc, key, &(&1 + 1))
  acc, _key, false -> acc
end

counts = %{ingredients: 0, products: 0, offers: 0, prices: 0}

add = fn counts, {new_ingredient?, new_product?, {new_offer?, new_price?}} ->
  counts
  |> tally.(:ingredients, new_ingredient?)
  |> tally.(:products, new_product?)
  |> tally.(:offers, new_offer?)
  |> tally.(:prices, new_price?)
end

# ── Water salts (batch 1): formula and ions on the ingredient ──────────
# {name, formula, ions, product form (nil: no product), BSG price per bag · 50 lb}
salts = [
  {"Calcium Carbonate (Chalk)", "CaCO₃", [ca: "105.8", co3: "158.4"], "Powder", "66.00"},
  {"Sodium Bicarbonate (Baking Soda)", "NaHCO₃", [hco3: "191.9", na: "72.3"], "Powder", "47.00"},
  {"Calcium Sulfate (Gypsum)", "CaSO₄·2H₂O", [ca: "61.5", so4: "147.4"], "Powder", "32.00"},
  {"Magnesium Sulfate (Epsom Salt)", "MgSO₄·7H₂O", [mg: "26.1", so4: "103.0"], "Powder", "97.00"},
  {"Sodium Chloride (Table Salt)", "NaCl", [na: "103.9", cl: "160.3"], "Powder", "34.00"},
  {"Calcium Chloride (Hydrous)", "CaCl₂·2H₂O", [ca: "72.0", cl: "127.4"], nil, nil},
  {"Calcium Chloride (Anhydrous)", "CaCl₂", [ca: "95.4", cl: "168.8"], "Flake", "77.00"}
]

# D63 §5.4: when its migration left Hydrous's product where it was, there's
# no second one here.
hydrous_product? =
  Repo.exists?(
    from p in Product,
      join: i in Ingredient,
      on: i.id == p.ingredient_id,
      where:
        i.category_id == ^category_ids.salts and
          fragment("lower(?)", i.name) == "calcium chloride (hydrous)"
  )

counts =
  Enum.reduce(salts, counts, fn {name, formula, ions, form, price}, counts ->
    {ing, new?} = ingredient.(name, category_ids.salts, [])
    if is_nil(ing.formula), do: Repo.update!(Ecto.Changeset.change(ing, formula: formula))

    for {ion, value} <- ions do
      Repo.insert!(
        %IngredientFeatureValue{
          ingredient_id: ing.id,
          feature_type_id: Map.fetch!(feature_ids, "#{ion}_ppm_per_g_gal"),
          value: Decimal.new(value),
          inserted_at: now,
          updated_at: now
        },
        on_conflict: :nothing,
        conflict_target: [:ingredient_id, :feature_type_id]
      )
    end

    if form && not (hydrous_product? and name == "Calcium Chloride (Anhydrous)") do
      {pid, new_product?} = product.(ing.id, nil, form, "lb", nil, [])
      add.(counts, {new?, new_product?, offer.(pid, "BSG", "bag", "50", nil, price)})
    else
      add.(counts, {new?, false, {false, false}})
    end
  end)

# ── Sugars (batch 2): extract a standard; prices are $/lb × weight ──────
# {ingredient, manufacturer, form, extract, supplier, pack, size, pack price}
sugars = [
  {"Lactose", nil, "Dry", "100", "BSG", "bag", "50", "50.00"},
  {"Dextrose (Corn Sugar)", nil, "Dry", "91.3", "BSG", "bag", "50", "45.50"},
  {"Belgian Candy Syrup", "Candico", "Liquid", "70", "BSG", "pail", "55", "42.90"},
  {"Black Strap Molasses", "Sweetener Sup Co.", "Liquid", "81.95", "BSG", "pail", "60", "49.20"},
  {"Honey", "Colorado Honey Co.", "Liquid", "80.33", "Redstone", "pail", "60", "120.00"},
  {"DME", "Muntons", "Dry", "96", "BSG", "bag", "55", "55.00"}
]

counts =
  Enum.reduce(sugars, counts, fn {name, maker, form, extract, supplier, pack, size, price},
                                 counts ->
    {ing, new?} = ingredient.(name, category_ids.sugars, [])

    {pid, new_product?} =
      product.(ing.id, maker, form, "lb", nil, [{"extract_fgdb", extract, nil}])

    add.(counts, {new?, new_product?, offer.(pid, supplier, pack, size, nil, price)})
  end)

# ── Fruit, Aseptic Fruit (batch 3): Purée in lb, Brix a typical range ──
# {fruit, pail size, price, Brix low, Brix high}; Strawberry is one product with two offers.
aseptic = [
  {"Passion Fruit", "11", "51.00", "12", "14"},
  {"Strawberry", "11", "45.00", "6.5", "9"},
  {"Strawberry", "44", "116.50", "6.5", "9"},
  {"Raspberry", "11", "69.00", "11", "13"},
  {"Pink Guava", "11", "29.00", "8", "11"},
  {"Grapefruit", "44", "82.00", "10", "13"},
  {"Lemon", "44", "99.50", "6", "9"},
  {"Lime", "44", "97.92", "6", "9.4"},
  {"Plum", "44", "113.50", "17", "20"},
  {"Blueberry", "44", "115.00", "10", "14"},
  {"Blood Orange", "44", "98.50", "6", "9.4"},
  {"Tangerine", "44", "103.50", "15", "17"},
  {"Watermelon", "44", "114.00", "12", "12"}
]

counts =
  Enum.reduce(aseptic, counts, fn {name, size, price, low, high}, counts ->
    {ing, new?} = ingredient.(name, category_ids.fruits, [])

    {pid, new_product?} =
      product.(ing.id, "Aseptic Fruit", "Purée", "lb", nil, [{"brix", low, high}])

    add.(counts, {new?, new_product?, offer.(pid, "Aseptic Fruit", "pail", size, nil, price)})
  end)

# ── Fruit, SoNature (batch 3b): manufacturer None, Brix low = high, no prices ──
sonature = [
  {"Apricot", "Juice / concentrate", "40", "50"},
  {"Cherry", "Juice / concentrate", "56", "11.4"},
  {"Lemon", "Purée", "40", "11"},
  {"Lime", "Purée", "40", "8"}
]

counts =
  Enum.reduce(sonature, counts, fn {name, form, size, brix}, counts ->
    {ing, new?} = ingredient.(name, category_ids.fruits, [])
    features = if brix, do: [{"brix", brix, brix}], else: []
    {pid, new_product?} = product.(ing.id, nil, form, "lb", nil, features)
    add.(counts, {new?, new_product?, offer.(pid, "SoNature", "pail", size, nil, nil)})
  end)

# ── Process Aids (D65: Finings, batch 4): Whirlfloc T, counted in tablets, ordered by the 5 lb tub ──
{whirlfloc, new?} =
  ingredient.("Whirlfloc", category_ids.process_aids, [category_ids.consumables])

{pid, new_product?} = product.(whirlfloc.id, nil, "Tablet", "each", "T", [])
counts = add.(counts, {new?, new_product?, offer.(pid, "BSG", "tub", "872", "5 lb", "92.00")})

# ── Spices (batch 5): ingredients only ──────────────────────────────────
spices =
  ~w(Cinnamon Clove Coriander) ++
    [
      "Juniper Berries",
      "Timut Pepper",
      "Lemongrass",
      "Cacao Nibs",
      "Vanilla Beans",
      "Coffee",
      "Peppermint Leaf"
    ]

counts =
  Enum.reduce(spices, counts, fn name, counts ->
    {_ing, new?} = ingredient.(name, category_ids.spices, [])
    add.(counts, {new?, false, {false, false}})
  end)

IO.puts(
  "D65 reference: #{map_size(party_ids)} companies, #{counts.ingredients} new ingredients, " <>
    "#{counts.products} new products, #{counts.offers} new offers, #{counts.prices} new prices"
)
