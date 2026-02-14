alias RockcutApi.Repo
alias RockcutApi.Brewing.IngredientCategory
alias RockcutApi.Brewing.CategoryFieldDefinition

# Seed ingredient categories (idempotent — skips existing)
categories =
  [
    {"Grain", 0},
    {"Extract", 1},
    {"Hop", 2},
    {"Yeast", 3},
    {"Fruit", 4},
    {"Spice", 5},
    {"Sugar", 6},
    {"Adjunct", 7}
  ]
  |> Enum.map(fn {name, sort_order} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %{name: name, sort_order: sort_order, inserted_at: now, updated_at: now}
  end)

Repo.insert_all(IngredientCategory, categories, on_conflict: :nothing, conflict_target: :name)

# Fetch category IDs for field definition seeding
category_ids =
  Repo.all(IngredientCategory)
  |> Map.new(fn c -> {c.name, c.id} end)

# Seed category field definitions (idempotent)
field_defs =
  [
    # Grain
    {category_ids["Grain"], "Origin", "text", nil, false, 0},
    {category_ids["Grain"], "Maltster", "text", nil, false, 1},
    # Hop
    {category_ids["Hop"], "Form", "dropdown", "Pellet, Whole Leaf, Cryo, Extract", false, 0},
    {category_ids["Hop"], "Origin", "text", nil, false, 1},
    {category_ids["Hop"], "Crop Year", "text", nil, false, 2},
    # Yeast
    {category_ids["Yeast"], "Lab", "text", nil, false, 0},
    {category_ids["Yeast"], "Product Code", "text", nil, false, 1},
    {category_ids["Yeast"], "Temp Range Low (F)", "number", nil, false, 2},
    {category_ids["Yeast"], "Temp Range High (F)", "number", nil, false, 3},
    {category_ids["Yeast"], "Form", "dropdown", "Dry, Liquid, Slurry", false, 4},
    # Fruit
    {category_ids["Fruit"], "Form", "dropdown", "Fresh, Puree, Frozen, Extract", false, 0},
    # Spice
    {category_ids["Spice"], "Form", "dropdown", "Whole, Ground, Extract", false, 0},
    # Sugar
    {category_ids["Sugar"], "Form", "dropdown", "Granulated, Liquid, Syrup", false, 0}
  ]
  |> Enum.map(fn {cat_id, field_name, field_type, options, required, sort_order} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %{
      category_id: cat_id,
      field_name: field_name,
      field_type: field_type,
      options: options,
      required: required,
      sort_order: sort_order,
      inserted_at: now,
      updated_at: now
    }
  end)

Repo.insert_all(CategoryFieldDefinition, field_defs,
  on_conflict: :nothing,
  conflict_target: [:category_id, :field_name]
)

# ---------------------------------------------------------------------------
# Seed ingredients + lots (idempotent)
# ---------------------------------------------------------------------------
alias RockcutApi.Brewing.Ingredient
alias RockcutApi.Brewing.IngredientLot

ingredients =
  [
    # Grains
    {category_ids["Grain"], "Pale 2-Row", "Base malt, American-style"},
    {category_ids["Grain"], "Munich 10L", "Adds bready, malty sweetness"},
    {category_ids["Grain"], "Crystal 40L", "Medium caramel, toffee notes"},
    {category_ids["Grain"], "Crystal 60L", "Deeper caramel, raisin notes"},
    {category_ids["Grain"], "Wheat Malt", "Improves head retention and body"},
    {category_ids["Grain"], "Flaked Oats", "Smooth mouthfeel, haze"},
    {category_ids["Grain"], "Victory Malt", "Biscuity, toasty character"},
    # Hops
    {category_ids["Hop"], "Centennial", "Citrus and floral, dual-purpose"},
    {category_ids["Hop"], "Cascade", "Classic American, grapefruit and floral"},
    {category_ids["Hop"], "Citra", "Tropical, passion fruit, grapefruit"},
    {category_ids["Hop"], "Mosaic", "Complex fruit: mango, blueberry, earthy"},
    {category_ids["Hop"], "Simcoe", "Pine, earthy, passion fruit"},
    {category_ids["Hop"], "Amarillo", "Orange citrus, floral"},
    # Yeast
    {category_ids["Yeast"], "US-05", "Clean American ale yeast (Fermentis)"},
    {category_ids["Yeast"], "WLP001", "California Ale (White Labs)"},
    {category_ids["Yeast"], "Wyeast 1056", "American Ale (Wyeast)"},
    {category_ids["Yeast"], "WLP002", "English Ale (White Labs)"},
    # Adjuncts / other
    {category_ids["Sugar"], "Corn Sugar (Dextrose)", "Priming sugar, lightens body"},
    {category_ids["Adjunct"], "Irish Moss", "Kettle fining agent"},
    {category_ids["Adjunct"], "Whirlfloc", "Tablet fining, aids clarity"},
  ]
  |> Enum.map(fn {cat_id, name, notes} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    %{category_id: cat_id, name: name, notes: notes, inserted_at: now, updated_at: now}
  end)

Repo.insert_all(Ingredient, ingredients,
  on_conflict: :nothing,
  conflict_target: [:name, :category_id]
)

# Fetch ingredient IDs for lot seeding
ingredient_ids =
  Repo.all(Ingredient)
  |> Map.new(fn i -> {i.name, i.id} end)

lots =
  [
    # Grains (color_lovibond + potential_gravity)
    {ingredient_ids["Pale 2-Row"], "G-2401", "Briess", "2026-01-15", "available",
     nil, Decimal.new("1.8"), Decimal.new("1.037"), nil, nil},
    {ingredient_ids["Munich 10L"], "G-2402", "Weyermann", "2026-01-15", "available",
     nil, Decimal.new("10"), Decimal.new("1.035"), nil, nil},
    {ingredient_ids["Crystal 40L"], "G-2403", "Briess", "2026-01-20", "available",
     nil, Decimal.new("40"), Decimal.new("1.034"), nil, nil},
    {ingredient_ids["Crystal 60L"], "G-2404", "Briess", "2026-01-20", "available",
     nil, Decimal.new("60"), Decimal.new("1.034"), nil, nil},
    {ingredient_ids["Wheat Malt"], "G-2405", "Rahr", "2026-01-10", "available",
     nil, Decimal.new("2"), Decimal.new("1.037"), nil, nil},
    {ingredient_ids["Flaked Oats"], "G-2406", "Bob's Red Mill", "2026-02-01", "available",
     nil, Decimal.new("1"), Decimal.new("1.033"), nil, nil},
    {ingredient_ids["Victory Malt"], "G-2407", "Briess", "2026-01-20", "available",
     nil, Decimal.new("25"), Decimal.new("1.034"), nil, nil},
    # Hops (alpha_acid)
    {ingredient_ids["Centennial"], "H-2401", "YCH Hops", "2025-12-10", "available",
     Decimal.new("10.5"), nil, nil, nil, nil},
    {ingredient_ids["Cascade"], "H-2402", "YCH Hops", "2025-12-10", "available",
     Decimal.new("5.8"), nil, nil, nil, nil},
    {ingredient_ids["Citra"], "H-2403", "Yakima Chief", "2026-01-05", "available",
     Decimal.new("12.0"), nil, nil, nil, nil},
    {ingredient_ids["Mosaic"], "H-2404", "Yakima Chief", "2026-01-05", "available",
     Decimal.new("11.5"), nil, nil, nil, nil},
    {ingredient_ids["Simcoe"], "H-2405", "YCH Hops", "2025-11-20", "available",
     Decimal.new("13.0"), nil, nil, nil, nil},
    {ingredient_ids["Amarillo"], "H-2406", "Virgil Gamache Farms", "2026-01-15", "available",
     Decimal.new("9.2"), nil, nil, nil, nil},
    # Yeast (attenuation)
    {ingredient_ids["US-05"], "Y-2401", "Fermentis", "2026-01-20", "available",
     nil, nil, nil, Decimal.new("78"), nil},
    {ingredient_ids["WLP001"], "Y-2402", "White Labs", "2026-02-01", "available",
     nil, nil, nil, Decimal.new("76"), nil},
    {ingredient_ids["Wyeast 1056"], "Y-2403", "Wyeast", "2026-02-01", "available",
     nil, nil, nil, Decimal.new("75"), nil},
    # Sugar
    {ingredient_ids["Corn Sugar (Dextrose)"], "S-2401", "LD Carlson", "2026-01-10", "available",
     nil, nil, Decimal.new("1.046"), nil, nil},
    # Depleted lot for demo
    {ingredient_ids["Cascade"], "H-2301", "YCH Hops", "2025-06-15", "depleted",
     Decimal.new("5.5"), nil, nil, nil, "2025 crop, used up"},
  ]
  |> Enum.map(fn {ing_id, lot_number, supplier, received_date, status,
                  alpha_acid, color_lovibond, potential_gravity, attenuation, notes} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %{
      ingredient_id: ing_id,
      lot_number: lot_number,
      supplier: supplier,
      received_date: Date.from_iso8601!(received_date),
      status: status,
      alpha_acid: alpha_acid,
      color_lovibond: color_lovibond,
      potential_gravity: potential_gravity,
      attenuation: attenuation,
      properties: nil,
      notes: notes,
      inserted_at: now,
      updated_at: now
    }
  end)

# Lots have no unique constraint, so only insert if table is empty to stay idempotent
if Repo.aggregate(IngredientLot, :count) == 0 do
  Repo.insert_all(IngredientLot, lots)
  IO.puts("Seeds complete: #{length(categories)} categories, #{length(field_defs)} field defs, #{length(ingredients)} ingredients, #{length(lots)} lots")
else
  IO.puts("Seeds complete: #{length(categories)} categories, #{length(field_defs)} field defs, #{length(ingredients)} ingredients (lots already seeded)")
end
