alias RockcutApi.Repo
alias RockcutApi.Brewing.IngredientCategory
alias RockcutApi.Brewing.CategoryFieldDefinition

# Seed ingredient categories (idempotent — skips existing)
categories =
  [
    {"Grains", 0},
    {"Future Ingredients", 1},
    {"Hops", 2},
    {"Yeast Strains", 3},
    {"Fruits", 4},
    {"Spices & Flavorings", 5},
    {"Sugars and Extracts", 6},
    {"Other Consumables", 7}
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
    # Grains
    {category_ids["Grains"], "Origin", "text", nil, false, 0},
    {category_ids["Grains"], "Maltster", "text", nil, false, 1},
    # Hops
    {category_ids["Hops"], "Form", "dropdown", "Pellet, Whole Leaf, Cryo, Extract", false, 0},
    {category_ids["Hops"], "Origin", "text", nil, false, 1},
    {category_ids["Hops"], "Crop Year", "text", nil, false, 2},
    # Yeast Strains
    {category_ids["Yeast Strains"], "Lab", "text", nil, false, 0},
    {category_ids["Yeast Strains"], "Product Code", "text", nil, false, 1},
    {category_ids["Yeast Strains"], "Temp Range Low (F)", "number", nil, false, 2},
    {category_ids["Yeast Strains"], "Temp Range High (F)", "number", nil, false, 3},
    {category_ids["Yeast Strains"], "Form", "dropdown", "Dry, Liquid, Slurry", false, 4},
    # Fruits
    {category_ids["Fruits"], "Form", "dropdown", "Fresh, Puree, Frozen, Extract", false, 0},
    # Spices & Flavorings
    {category_ids["Spices & Flavorings"], "Form", "dropdown", "Whole, Ground, Extract", false, 0},
    # Sugars and Extracts
    {category_ids["Sugars and Extracts"], "Form", "dropdown", "Granulated, Liquid, Syrup", false, 0}
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

grain_names = [
  "2-Row", "Acidulated", "Barley, Roasted", "Beech Smoked Malt", "Biscuit",
  "Black Malt", "Brown Malt", "Carafa 3 - dehusked", "Caramunich 1", "Caramunich 2",
  "Caramunich 3", "CaraRed", "CaraRuby", "Chocolate Malt", "Crystal Dark (94L-107L)",
  "Crystal Light (36L-43L)", "Crystal Medium (63L-72L)", "Dextrin", "English Pale",
  "Honey Malt", "Maris Otter", "Melanoidin Malt", "Munich 4", "Munich 10",
  "Munich Barke", "Munich Malt 1", "Munich Malt 2", "Oats, Flaked", "Oats, Malted",
  "Pilsner", "Pilsner-Barke", "Rye Malt", "Special B", "Vienna Malt",
  "Wheat, Extra Pale", "Wheat, Torrified", "Wheat, Munich", "Wheat, White"
]

grain_ingredients =
  grain_names
  |> Enum.map(fn name ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    %{category_id: category_ids["Grains"], name: name, notes: nil, inserted_at: now, updated_at: now}
  end)

Repo.insert_all(Ingredient, grain_ingredients, on_conflict: :nothing, conflict_target: [:name, :category_id])

other_ingredients =
  [
    # Hops
    {category_ids["Hops"], "Centennial", "Citrus and floral, dual-purpose"},
    {category_ids["Hops"], "Cascade", "Classic American, grapefruit and floral"},
    {category_ids["Hops"], "Citra", "Tropical, passion fruit, grapefruit"},
    {category_ids["Hops"], "Mosaic", "Complex fruit: mango, blueberry, earthy"},
    {category_ids["Hops"], "Simcoe", "Pine, earthy, passion fruit"},
    {category_ids["Hops"], "Amarillo", "Orange citrus, floral"},
    # Yeast Strains
    {category_ids["Yeast Strains"], "US-05", "Clean American ale yeast (Fermentis)"},
    {category_ids["Yeast Strains"], "WLP001", "California Ale (White Labs)"},
    {category_ids["Yeast Strains"], "Wyeast 1056", "American Ale (Wyeast)"},
    {category_ids["Yeast Strains"], "WLP002", "English Ale (White Labs)"},
    # Sugars and Extracts
    {category_ids["Sugars and Extracts"], "Corn Sugar (Dextrose)", "Priming sugar, lightens body"},
    # Other Consumables
    {category_ids["Other Consumables"], "Irish Moss", "Kettle fining agent"},
    {category_ids["Other Consumables"], "Whirlfloc", "Tablet fining, aids clarity"},
  ]
  |> Enum.map(fn {cat_id, name, notes} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    %{category_id: cat_id, name: name, notes: notes, inserted_at: now, updated_at: now}
  end)

Repo.insert_all(Ingredient, other_ingredients, on_conflict: :nothing, conflict_target: [:name, :category_id])

# Fetch ingredient IDs for lot seeding
ingredient_ids =
  Repo.all(Ingredient)
  |> Map.new(fn i -> {i.name, i.id} end)

# ---------------------------------------------------------------------------
# Grain lots
# ---------------------------------------------------------------------------
d = fn nil -> nil; s -> Decimal.new(s) end

grain_lots_raw = [
  # {ingredient_name, lot_number, maltster, supplier, moisture, fgdb, protein, color, diastatic, order_name, order_unit_size}
  {"2-Row",                    "Root-2-Row-2026",                 "Root Shoot",   "RS",  "3.30", "80.30", "11.50", "2.71",   "124",   nil,                                       "50"},
  {"2-Row",                    "Rahr-2-Row-2026",                 "Rahr",         "BSG", "4.70", "81.50", "11.00", "2.00",   "154",   "Rahr - Standard 2-row (milled)",          "55"},
  {"Acidulated",               "Weye-Acidulated-2026",            "Weyermann",    "BSG", "5.80", nil,     nil,     "2.10",   "0",     "Weyermann - Acidulated Malt",             "55"},
  {"Barley, Roasted",          "Simp-Barley, Roasted-2026",       "Simpsons",     "BSG", "2.10", "62.00", nil,     "552.10", "0",     "Simpsons - Roasted Barley",               "55"},
  {"Beech Smoked Malt",        "Weye-Beech Smoked Malt-2026",     "Weyermann",    "BSG", "4.50", "82.10", "10.40", "2.50",   "0",     "Weyermann - Rauch Malt",                  "55"},
  {"Biscuit",                  "Ding-Biscuit-2026",               "Dingmans",     "BSG", "3.54", "77.90", "11.50", "18.17",  "0",     "Dingmans - Biscuit",                      "55"},
  {"Black Malt",               "Simp-Black Malt-2026",            "Simpsons",     "BSG", "3.00", "69.00", nil,     "625.55", "0",     "Simpsons - Black Malt",                   "55"},
  {"Brown Malt",               "Cris-Brown Malt-2026",            "Crisp",        "BSG", "3.00", "76.50", nil,     "65.00",  "0",     "Simpsons - Brown Malt",                   "55"},
  {"Carafa 3 - dehusked",      "Weye-Carafa 3 - dehusked-2026",   "Weyermann",    "BSG", "3.60", "72.30", nil,     "528.30", "0",     "Weyermann - Carafa 3 Special",            "55"},
  {"Caramunich 1",             "Weye-Caramunich 1-2026",          "Weyermann",    "BSG", "6.00", "77.60", nil,     "34.40",  "0",     "Weyermann - Caramunich 1",                "55"},
  {"Caramunich 2",             "Weye-Caramunich 2-2026",          "Weyermann",    "BSG", "6.00", "77.20", nil,     "45.70",  "0",     "Weyermann - Caramunich 2",                "55"},
  {"Caramunich 3",             "Weye-Caramunich 3-2026",          "Weyermann",    "BSG", "6.20", "75.90", nil,     "57.00",  "0",     "Weyermann - Caramunich 3",                "55"},
  {"CaraRed",                  "Weye-CaraRed-2026",               "Weyermann",    "BSG", "6.80", "76.60", nil,     "20.10",  "0",     "Weyermann - CaraRed",                     "55"},
  {"CaraRuby",                 "Root-CaraRuby-2026",              "Root Shoot",   "RS",  "4.10", "81.20", nil,     "25.59",  "70",    nil,                                       "50"},
  {"Chocolate Malt",           "Simp-Chocolate Malt-2026",        "Simpsons",     "BSG", "2.20", "69.00", nil,     "408.50", "0",     "Simpsons - Chocolate Malt",               "55"},
  {"Crystal Dark (94L-107L)",  "Simp-Crystal Dark-2026",          "Simpsons",     "BSG", "4.20", "69.00", nil,     "100.10", "0",     "Simpsons - Crystal Dark",                 "55"},
  {"Crystal Light (36L-43L)",  "Simp-Crystal Light-2026",         "Simpsons",     "BSG", "4.90", "69.00", nil,     "42.30",  "0",     "Simpsons - Crystal Light",                "55"},
  {"Crystal Medium (63L-72L)", "Simp-Crystal Medium-2026",        "Simpsons",     "BSG", "4.60", "69.00", nil,     "65.70",  "0",     "Simpsons - Crystal Medium",               "55"},
  {"Dextrin",                  "Cris-Dextrin-2026",               "Crisp",        "BSG", "5.30", "79.90", nil,     "1.60",   "95",    "Crisp - Dextrin",                         "55"},
  {"English Pale",             "Root-English Pale-2026",          "Root Shoot",   "RS",  "3.20", "81.40", "10.50", "4.27",   "130",   nil,                                       "50"},
  {"Honey Malt",               "Root-Honey Malt-2026",            "Root Shoot",   "RS",  "3.40", "80.50", "11.00", "32.69",  "66",    nil,                                       "50"},
  {"Maris Otter",              "Simp-Maris Otter-2026",           "Simpsons",     "BSG", "2.90", "81.00", "8.91",  "2.40",   "62.70", "Simpsons - Maris Otter (milled)",         "55"},
  {"Melanoidin Malt",          "Weye-Melanoidin Malt-2026",       "Weyermann",    "BSG", "4.50", "77.90", nil,     "28.70",  "0",     "Weyermann - Melanoidin Malt",             "55"},
  {"Munich 4",                 "Root-Munich 4-2026",              "Root Shoot",   "RS",  "2.40", "80.40", "11.80", "4.04",   "100",   nil,                                       "50"},
  {"Munich 10",                "Root-Munich 10-2026",             "Root Shoot",   "RS",  "2.90", "80.50", "11.70", "10.13",  "71",    nil,                                       "50"},
  {"Munich Barke",             "Weye-Munich Barke-2026",          "Weyermann",    "BSG", "4.00", "78.00", "10.50", "7.80",   "70",    "Weyermann - Munich Barke (milled)",       "55"},
  {"Munich Malt 1",            "Weye-Munich Malt 1-2026",         "Weyermann",    "BSG", "4.50", "81.70", "10.40", "6.50",   "70",    "Weyermann - Munich 1 (milled)",           "55"},
  {"Munich Malt 2",            "Weye-Munich Malt 2-2026",         "Weyermann",    "BSG", "3.90", "81.50", "10.60", "8.70",   "25",    "Weyermann - Munich 2 (milled)",           "55"},
  {"Oats, Flaked",             "Grai-Oats, Flaked-2026",          "Grain Millers","BSG", "8.00", nil,     "13.00", "1.50",   "0",     "Grain Millers - Rolled Oats",             "50"},
  {"Oats, Malted",             "Root-Oats, Malted-2026",          "Root Shoot",   "RS",  "2.20", "62.60", nil,     "1.00",   nil,     nil,                                       "50"},
  {"Pilsner",                  "Root-Pilsner-2026",               "Root Shoot",   "RS",  "5.00", "80.80", "10.50", "1.60",   "125",   nil,                                       "50"},
  {"Pilsner",                  "Weye-Pilsner-2026",               "Weyermann",    "BSG", "3.90", "80.50", "10.75", "1.75",   "110",   "Weyermann - Pilsner (milled)",            "55"},
  {"Pilsner",                  "Rahr-Pilsner-2026",               "Rahr",         "BSG", "4.70", "81.50", "11.00", "2.00",   "154",   "Rahr to Thee - Pilsner (milled)",         "55"},
  {"Pilsner-Barke",            "Weye-Pilsner-Barke-2026",         "Weyermann",    "BSG", "3.90", "80.50", "10.75", "1.75",   "110",   "Weyermann - Pilsner Barke (milled)",      "55"},
  {"Rye Malt",                 "Root-Rye Malt-2026",              "Root Shoot",   "RS",  "4.20", "89.10", "10.00", "3.82",   "125",   nil,                                       "50"},
  {"Rye Malt",                 "Weye-Rye Malt-2026",              "Weyermann",    "BSG", "5.80", "83.00", nil,     "2.30",   "105",   "Weyermann - Rye Malt (milled)",           "55"},
  {"Special B",                "Ding-Special B-2026",             "Dingemans",    "BSG", "3.58", "77.90", nil,     "104.61", "0",     "Dingemans - Special B",                   "55"},
  {"Vienna Malt",              "Root-Vienna Malt-2026",           "Root Shoot",   "RS",  "3.30", "79.90", "11.90", "8.59",   "71",    nil,                                       "50"},
  {"Vienna Malt",              "Weye-Vienna Malt-2026",           "Weyermann",    "BSG", "5.50", "79.00", "11.00", "3.25",   "70",    "Weyermann - Vienna (milled)",             "55"},
  {"Wheat, Extra Pale",        "Rahr-Wheat, Extra Pale-2026",     "Rahr",         "BSG", "4.50", "85.00", "12.00", "3.25",   "190",   "Rahr - Extra Pale White Wheat (milled)",  "55"},
  {"Wheat, Torrified",         "Cris-Wheat, Torrified-2026",      "Crisp",        "BSG", "10.00","86.50", nil,     "1.90",   "0",     "Crisp - Torrified Wheat (milled)",        "55"},
  {"Wheat, Munich",            "Root-Wheat, Munich-2026",         "Root Shoot",   "RS",  "2.20", "82.40", "13.80", "5.99",   "83",    nil,                                       "50"},
  {"Wheat, White",             "Root-Wheat, White-2026",          "Root Shoot",   "RS",  "3.80", "82.50", "13.70", "2.69",   "138",   nil,                                       "50"},
  {"Wheat, White",             "Rahr-Wheat, White-2026",          "Rahr",         "BSG", "4.50", "85.00", "12.00", "3.25",   "190",   "Rahr - White Wheat (milled)",             "55"},
]

grain_lots =
  grain_lots_raw
  |> Enum.map(fn {ing_name, lot_number, maltster, supplier, moisture, fgdb, protein, color, diastatic, order_name, unit_size} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    %{
      ingredient_id:          ingredient_ids[ing_name],
      lot_number:             lot_number,
      maltster:               maltster,
      supplier:               supplier,
      received_date:          Date.from_iso8601!("2026-01-01"),
      status:                 "available",
      moisture_perc:          d.(moisture),
      extract_potential_fgdb: d.(fgdb),
      protein_perc:           d.(protein),
      color_lovibond:         d.(color),
      diastatic_power_linter: d.(diastatic),
      order_name:             order_name,
      order_unit_size:        unit_size,
      properties:             nil,
      notes:                  nil,
      inserted_at:            now,
      updated_at:             now
    }
  end)

# ---------------------------------------------------------------------------
# Non-grain lots (hops, yeast, sugar, other)
# ---------------------------------------------------------------------------
other_lots_raw = [
  # {ingredient_name, lot_number, supplier, received_date, status, alpha_acid, color_lovibond, attenuation, notes}
  {"Centennial",             "H-2401", "YCH Hops",           "2025-12-10", "available", "10.5", nil,   nil,  nil},
  {"Cascade",                "H-2402", "YCH Hops",           "2025-12-10", "available",  "5.8", nil,   nil,  nil},
  {"Citra",                  "H-2403", "Yakima Chief",        "2026-01-05", "available", "12.0", nil,   nil,  nil},
  {"Mosaic",                 "H-2404", "Yakima Chief",        "2026-01-05", "available", "11.5", nil,   nil,  nil},
  {"Simcoe",                 "H-2405", "YCH Hops",           "2025-11-20", "available", "13.0", nil,   nil,  nil},
  {"Amarillo",               "H-2406", "Virgil Gamache Farms","2026-01-15", "available",  "9.2", nil,   nil,  nil},
  {"Cascade",                "H-2301", "YCH Hops",           "2025-06-15", "depleted",   "5.5", nil,   nil,  "2025 crop, used up"},
  {"US-05",                  "Y-2401", "Fermentis",           "2026-01-20", "available",  nil,   nil,  "78",  nil},
  {"WLP001",                 "Y-2402", "White Labs",          "2026-02-01", "available",  nil,   nil,  "76",  nil},
  {"Wyeast 1056",            "Y-2403", "Wyeast",              "2026-02-01", "available",  nil,   nil,  "75",  nil},
  {"Corn Sugar (Dextrose)",  "S-2401", "LD Carlson",          "2026-01-10", "available",  nil,   nil,   nil,  nil},
  {"Irish Moss",             "O-2401", "Various",             "2026-01-10", "available",  nil,   nil,   nil,  nil},
  {"Whirlfloc",              "O-2402", "Various",             "2026-01-10", "available",  nil,   nil,   nil,  nil},
]

other_lots =
  other_lots_raw
  |> Enum.map(fn {ing_name, lot_number, supplier, received_date, status, alpha_acid, color_lovibond, attenuation, notes} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    %{
      ingredient_id:  ingredient_ids[ing_name],
      lot_number:     lot_number,
      supplier:       supplier,
      received_date:  Date.from_iso8601!(received_date),
      status:         status,
      alpha_acid:     d.(alpha_acid),
      color_lovibond: d.(color_lovibond),
      attenuation:    d.(attenuation),
      notes:          notes,
      properties:     nil,
      inserted_at:    now,
      updated_at:     now
    }
  end)

if Repo.aggregate(IngredientLot, :count) == 0 do
  Repo.insert_all(IngredientLot, grain_lots)
  Repo.insert_all(IngredientLot, other_lots)
  total = length(grain_lots) + length(other_lots)
  IO.puts("Seeds complete: #{length(categories)} categories, #{length(field_defs)} field defs, #{length(grain_ingredients) + length(other_ingredients)} ingredients, #{total} lots")
else
  IO.puts("Seeds complete: #{length(categories)} categories, #{length(field_defs)} field defs, #{length(grain_ingredients) + length(other_ingredients)} ingredients (lots already seeded — reset DB to reseed lots)")
end
