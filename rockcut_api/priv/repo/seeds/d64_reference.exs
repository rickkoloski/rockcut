# D64 spec Amendment (Matt, 2026-11-22; answers Q1): yeast reference data on
# every environment. No lots: Matt gave no on-hand amounts.
#
# Idempotent and matched by name, ignoring case: a company, a strain
# (ingredient in Yeast Strains), a product (strain + lab + form + code), an
# offer (product + supplier + pack) or a price (offer + 2026-11-22) that
# exists is left as it is, so edits made on the screens stick. A strain gets
# its Strain Type only where it has none. The old seeded US-05 (ingredient)
# becomes Chico Ale (A1: the code is the product's name now), unless a
# Chico Ale is there already. Run from `priv/repo/seeds.exs`, after the
# grain reference (BSG is there already) and the D64 migrations (Strain
# Types, the yeast features).
#
# Source: the git-excluded `docs/current_work/reference/d64_yeast_matt_2026-11-22.csv`,
# embedded below. Names as the spec settles them: White Labs (A14), German
# Monk Lager (A15, "Germon" in the CSV), Vermont Ale Modi kept. "X bbl
# pitchable" is a pitchable · 1 with no usual size (Amendment 6: each Liquid
# lot is asked its size); "500g brick" is a brick · 1 with the note "500 g".

import Ecto.Query, only: [from: 2]

alias RockcutApi.Repo
alias RockcutApi.Brewing.{Ingredient, IngredientCategory}
alias RockcutApi.Ingredients.{OfferPrice, Party, PartyRole, Product, SupplierOffer}
alias RockcutApi.Yeast.StrainType

effective = ~D[2026-11-22]

# {supplier, lab, strain ID (product name), strain (ingredient), type, form, price per pack}
rows = [
  {"Inland Island", "Inland Island", "II-008", "East Coast IPA", "Ale", "Liquid", nil},
  {"Inland Island", "Inland Island", "II-711", "German Monk Lager", "Lager", "Liquid", nil},
  {"Inland Island", "Inland Island", "II-574", "Kolsch II", "Ale", "Liquid", nil},
  {"Inland Island", "Inland Island", "II-903", "Brett Brux III", "Brett", "Liquid", nil},
  {"Inland Island", "Inland Island", "II-991", "Lactobacillus brevis", "Lacto", "Liquid", nil},
  {"Inland Island", "Inland Island", "II-1001D", "Dry Chico", "Ale", "Dry", nil},
  {"Inland Island", "Inland Island", "II-1002D", "Dry Lager", "Lager", "Dry", nil},
  {"Inland Island", "Inland Island", "II-1003D", "Dry English", "Ale", "Dry", nil},
  {"BSG", "Fermentis", "US-05", "Chico Ale", "Ale", "Dry", "76.99"},
  {"BSG", "Fermentis", "S-04", "London Ale", "Ale", "Dry", "76.99"},
  {"White Labs", "White Labs", "WLPMD4000", "Vermont Ale Modi", "Ale", "Liquid", nil}
]

# ── Companies ───────────────────────────────────────────────────────────
# The three labs D64 adds (Amendment 4); BSG is reused as a supplier.
companies = [
  {"Inland Island", ~w(manufacturer supplier)},
  {"Fermentis", ~w(manufacturer)},
  {"White Labs", ~w(manufacturer supplier)}
]

company = fn name, roles ->
  party =
    Repo.one(from p in Party, where: fragment("lower(?)", p.name) == ^String.downcase(name)) ||
      Repo.insert!(%Party{name: name})

  for role <- roles do
    Repo.insert!(%PartyRole{party_id: party.id, role: role},
      on_conflict: :nothing,
      conflict_target: [:party_id, :role]
    )
  end

  party.id
end

party_ids = Map.new(companies, fn {name, roles} -> {name, company.(name, roles)} end)
party_ids = Map.put(party_ids, "BSG", company.("BSG", ~w(supplier)))

# ── Category and strain types ───────────────────────────────────────────
yeast =
  Repo.one(from c in IngredientCategory, where: c.key == "yeast", select: c.id) ||
    raise "D64 reference: no Yeast Strains category (key yeast); run the seeds' categories first"

type_ids =
  Repo.all(StrainType)
  |> Map.new(fn t -> {String.downcase(t.name), t.id} end)

for {_, _, _, _, type, _, _} <- rows, not Map.has_key?(type_ids, String.downcase(type)) do
  raise "D64 reference: no strain type #{type}; run the D64 migrations first"
end

# US-05 (the old seeded strain) is Chico Ale now, when there's no Chico Ale yet.
by_name = fn name ->
  Repo.one(
    from i in Ingredient,
      where: i.category_id == ^yeast and fragment("lower(?)", i.name) == ^String.downcase(name),
      limit: 1
  )
end

case {by_name.("US-05"), by_name.("Chico Ale")} do
  {%Ingredient{} = old, nil} -> Repo.update!(Ecto.Changeset.change(old, name: "Chico Ale"))
  _ -> :ok
end

# A strain by name (any case); created when there's none. Its type is set
# only where it has none. {id, new?}
strain = fn name, type ->
  type_id = Map.fetch!(type_ids, String.downcase(type))

  case by_name.(name) do
    %Ingredient{yeast_strain_type_id: nil} = i ->
      Repo.update!(Ecto.Changeset.change(i, yeast_strain_type_id: type_id))
      {i.id, false}

    %Ingredient{} = i ->
      {i.id, false}

    nil ->
      i = Repo.insert!(%Ingredient{name: name, category_id: yeast, yeast_strain_type_id: type_id})
      {i.id, true}
  end
end

# A product: strain + lab + form + code (any case). {id, new?}
product = fn ingredient_id, lab, form, code ->
  lab_id = Map.fetch!(party_ids, lab)

  existing =
    Repo.one(
      from p in Product,
        where:
          p.ingredient_id == ^ingredient_id and p.manufacturer_party_id == ^lab_id and
            p.form == ^form and
            fragment("lower(coalesce(?, ''))", p.name) == ^String.downcase(code),
        limit: 1
    )

  case existing do
    %Product{} = p ->
      {p.id, false}

    nil ->
      p =
        Repo.insert!(%Product{
          ingredient_id: ingredient_id,
          manufacturer_party_id: lab_id,
          form: form,
          unit: "each",
          name: code
        })

      {p.id, true}
  end
end

# An offer (product + supplier + pack · 1) and its 2026-11-22 price when given.
# {new offer?, new price?}
offer = fn product_id, supplier, pack, note, price ->
  supplier_id = Map.fetch!(party_ids, supplier)

  existing =
    Repo.all(
      from o in SupplierOffer,
        where:
          o.product_id == ^product_id and o.supplier_party_id == ^supplier_id and
            o.pack_name == ^pack
    )
    |> Enum.find(&Decimal.eq?(&1.pack_size, 1))

  {o, new_offer?} =
    case existing do
      %SupplierOffer{} = o ->
        {o, false}

      nil ->
        {Repo.insert!(%SupplierOffer{
           product_id: product_id,
           supplier_party_id: supplier_id,
           pack_name: pack,
           pack_size: Decimal.new(1),
           pack_note: note,
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

count = fn
  n, true -> n + 1
  n, false -> n
end

counts =
  Enum.reduce(rows, %{ingredients: 0, products: 0, offers: 0, prices: 0}, fn
    {supplier, lab, code, name, type, form, price}, counts ->
      {ingredient_id, new_ingredient?} = strain.(name, type)
      {product_id, new_product?} = product.(ingredient_id, lab, form, code)

      {pack, note} = if form == "Dry", do: {"brick", "500 g"}, else: {"pitchable", nil}
      {new_offer?, new_price?} = offer.(product_id, supplier, pack, note, price)

      %{
        ingredients: count.(counts.ingredients, new_ingredient?),
        products: count.(counts.products, new_product?),
        offers: count.(counts.offers, new_offer?),
        prices: count.(counts.prices, new_price?)
      }
  end)

IO.puts(
  "D64 reference: #{length(companies)} companies, #{counts.ingredients} new ingredients, " <>
    "#{counts.products} new products, #{counts.offers} new offers, #{counts.prices} new prices"
)
