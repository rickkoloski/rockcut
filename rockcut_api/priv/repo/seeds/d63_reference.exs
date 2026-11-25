# D63 §5.1, §5.2 (Matt, 2026-11-24): the catalog rows the recipes call for, on
# every environment: four process aids with an offer each, one product for
# each of the seven spices, and EKG with its placeholder lot. No prices.
#
# Idempotent and matched by name, ignoring case: a company, an ingredient (in
# its category), a product (ingredient + manufacturer, None included + form,
# no product name) or an offer (product + supplier + pack) that exists is left
# as it is, so edits made on the screens stick. EKG's lot is added only while
# EKG has no lot at all. Run from `priv/repo/seeds.exs`, after the hop, D65
# and D64 references (the hop companies and BSG, the spices, White Labs) and
# the D63 migrations (Process Aids).

import Ecto.Query, only: [from: 2]

alias RockcutApi.Repo
alias RockcutApi.Brewing.{Ingredient, IngredientCategory, IngredientLot}

alias RockcutApi.Ingredients.{
  Catalog,
  FeatureType,
  LotFeatureValue,
  Movement,
  Party,
  PartyRole,
  Product,
  SupplierOffer,
  UseOrder
}

# ── Companies ───────────────────────────────────────────────────────────
companies = [
  {"BSG", ~w(manufacturer supplier)},
  {"Kerry", ~w(manufacturer)},
  {"White Labs", ~w(manufacturer supplier)},
  {"Lupulin Exchange", ~w(manufacturer supplier)}
]

{party_ids, new_companies} =
  Enum.reduce(companies, {%{}, 0}, fn {name, roles}, {ids, made} ->
    existing =
      Repo.one(from p in Party, where: fragment("lower(?)", p.name) == ^String.downcase(name))

    party = existing || Repo.insert!(%Party{name: name})

    for role <- roles do
      Repo.insert!(%PartyRole{party_id: party.id, role: role},
        on_conflict: :nothing,
        conflict_target: [:party_id, :role]
      )
    end

    {Map.put(ids, name, party.id), if(existing, do: made, else: made + 1)}
  end)

# ── Categories ──────────────────────────────────────────────────────────
top = fn key -> Repo.one(from c in IngredientCategory, where: c.key == ^key, select: c.id) end

process_aids =
  Repo.one(
    from c in IngredientCategory,
      join: p in IngredientCategory,
      on: p.id == c.parent_id,
      where: p.key == "consumables" and fragment("lower(?)", c.name) == "process aids",
      select: c.id
  )

category_ids = %{process_aids: process_aids, spices: top.("spices"), hops: top.("hops")}
missing = for {k, nil} <- category_ids, do: k

if missing != [] do
  raise "D63 reference: categories not found (#{Enum.join(missing, ", ")}); run the D63 migrations first"
end

# An ingredient by name (any case) in `category`; created when there's none. {id, new?}
ingredient = fn name, category ->
  case Repo.one(
         from i in Ingredient,
           where:
             i.category_id == ^category and fragment("lower(?)", i.name) == ^String.downcase(name),
           select: i.id,
           limit: 1
       ) do
    nil -> {Repo.insert!(%Ingredient{name: name, category_id: category}).id, true}
    id -> {id, false}
  end
end

# The unnamed product of an ingredient, maker (nil: None) and form. {id, new?}
product = fn ingredient_id, maker, form, unit ->
  maker_id = maker && Map.fetch!(party_ids, maker)

  existing =
    Repo.one(
      from p in Product,
        where:
          p.ingredient_id == ^ingredient_id and p.form == ^form and is_nil(p.name) and
            coalesce(p.manufacturer_party_id, 0) == ^(maker_id || 0),
        select: p.id,
        limit: 1
    )

  case existing do
    nil ->
      p =
        Repo.insert!(%Product{
          ingredient_id: ingredient_id,
          manufacturer_party_id: maker_id,
          form: form,
          unit: unit
        })

      {p.id, true}

    id ->
      {id, false}
  end
end

# An offer (product + supplier + pack and size). new?
offer = fn product_id, supplier, order_name, pack, size ->
  supplier_id = Map.fetch!(party_ids, supplier)
  size = Decimal.new(size)

  existing? =
    Repo.all(
      from o in SupplierOffer,
        where:
          o.product_id == ^product_id and o.supplier_party_id == ^supplier_id and
            o.pack_name == ^pack
    )
    |> Enum.any?(&Decimal.eq?(&1.pack_size, size))

  unless existing? do
    Repo.insert!(%SupplierOffer{
      product_id: product_id,
      supplier_party_id: supplier_id,
      order_name: order_name,
      pack_name: pack,
      pack_size: size,
      # Milled/whole is grain's alone.
      form: nil
    })
  end

  not existing?
end

count = fn
  n, true -> n + 1
  n, false -> n
end

add = fn counts, new_ingredient?, new_product?, new_offer? ->
  %{
    ingredients: count.(counts.ingredients, new_ingredient?),
    products: count.(counts.products, new_product?),
    offers: count.(counts.offers, new_offer?)
  }
end

counts = %{ingredients: 0, products: 0, offers: 0}

# ── Process aids (§5.1; A2: Amylo300 is a liquid in grams; A4: the packs) ──
# {name, maker, supplier, form, unit, pack, size in the unit}
aids = [
  {"Zinc Sulfate Heptahydrate", "BSG", "BSG", "Powder", "g", "bag", "250"},
  {"Amylo300", "Kerry", "BSG", "Liquid", "g", "bottle", "1000"},
  {"Clarity Ferm", "White Labs", "White Labs", "Liquid", "mL", "jug", "10000"},
  {"Ultra-Ferm", "White Labs", "White Labs", "Liquid", "mL", "bottle", "1000"}
]

counts =
  Enum.reduce(aids, counts, fn {name, maker, supplier, form, unit, pack, size}, counts ->
    {ingredient_id, new_ingredient?} = ingredient.(name, category_ids.process_aids)
    {product_id, new_product?} = product.(ingredient_id, maker, form, unit)

    add.(
      counts,
      new_ingredient?,
      new_product?,
      offer.(product_id, supplier, nil, pack, size)
    )
  end)

# ── Spices (§5.2; A3: these three are Ground): None, oz, no offers ──────
spices = [
  {"Juniper Berries", "Whole"},
  {"Timut Pepper", "Whole"},
  {"Lemongrass", "Whole"},
  {"Chamomile", "Whole"},
  {"Cinnamon", "Ground"},
  {"Allspice", "Ground"},
  {"Clove", "Ground"}
]

counts =
  Enum.reduce(spices, counts, fn {name, form}, counts ->
    {ingredient_id, new_ingredient?} = ingredient.(name, category_ids.spices)
    {_id, new_product?} = product.(ingredient_id, nil, form, "oz")
    add.(counts, new_ingredient?, new_product?, false)
  end)

# ── EKG (§5.2): no range, and a placeholder lot Matt checks ─────────────
{pack_name, pack_size} = Catalog.fixed_pack("hops")
{ekg, new_ingredient?} = ingredient.("EKG", category_ids.hops)
{ekg_product, new_product?} = product.(ekg, "Lupulin Exchange", "T90 Pellet", "lb")

counts =
  add.(
    counts,
    new_ingredient?,
    new_product?,
    offer.(ekg_product, "Lupulin Exchange", "EKG", pack_name, pack_size)
  )

placeholder = "Placeholder: check the lot number, alpha and weight"
received = ~D[2026-11-24]

new_lots =
  if Repo.exists?(from l in IngredientLot, where: l.ingredient_id == ^ekg) do
    0
  else
    lot =
      UseOrder.insert_lot!(%IngredientLot{
        ingredient_id: ekg,
        product_id: ekg_product,
        supplier_party_id: party_ids["Lupulin Exchange"],
        lot_number: "EKG-2025",
        crop_year: 2025,
        received_date: received,
        pack_name: pack_name,
        pack_size: pack_size,
        notes: placeholder
      })

    Repo.insert!(%LotFeatureValue{
      lot_id: lot.id,
      feature_type_id:
        Repo.one!(from f in FeatureType, where: f.key == "alpha_acid_pct", select: f.id),
      value: Decimal.new("5.9")
    })

    Repo.insert!(%Movement{
      lot_id: lot.id,
      kind: "opening",
      quantity: Decimal.new(11),
      occurred_on: received,
      note: placeholder
    })

    1
  end

IO.puts(
  "D63 reference: #{new_companies} new companies, #{counts.ingredients} new ingredients, " <>
    "#{counts.products} new products, #{counts.offers} new offers, #{new_lots} new lots"
)
