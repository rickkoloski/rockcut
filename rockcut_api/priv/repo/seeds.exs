import Ecto.Query, only: [from: 2]
alias RockcutApi.Repo
alias RockcutApi.Brewing.IngredientCategory
alias RockcutApi.Brewing.CategoryFieldDefinition

# Seed ingredient categories (idempotent — skips existing)
categories =
  [
    {"Grains", 0},
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

# D62: the top-level categories' keys (`Ingredients.Catalog`), set by name
# only where a key isn't taken yet, so a renamed category keeps its key.
for {name, key} <- [
      {"Grains", "grains"},
      {"Hops", "hops"},
      {"Fruits", "fruits"},
      {"Spices & Flavorings", "spices"},
      {"Sugars and Extracts", "sugars"},
      {"Other Consumables", "consumables"},
      {"Yeast Strains", "yeast"}
    ],
    not Repo.exists?(from c in IngredientCategory, where: c.key == ^key) do
  Repo.update_all(
    from(c in IngredientCategory,
      where: c.name == ^name and is_nil(c.parent_id) and is_nil(c.key)
    ),
    set: [key: key]
  )
end

# Top-level category IDs by key (D62), for the seeding below
category_ids =
  Repo.all(from c in IngredientCategory, where: not is_nil(c.key))
  |> Map.new(fn c -> {c.key, c.id} end)

# Seed category field definitions (idempotent)
field_defs =
  [
    # Grains: none (D60 decision 2 dropped Origin and Maltster).
    # Hops: none (D62 §3.1: form and origin are on the product, crop year on the lot).
    # Yeast Strains
    {category_ids["yeast"], "Lab", "text", nil, false, 0},
    {category_ids["yeast"], "Product Code", "text", nil, false, 1},
    {category_ids["yeast"], "Temp Range Low (F)", "number", nil, false, 2},
    {category_ids["yeast"], "Temp Range High (F)", "number", nil, false, 3},
    {category_ids["yeast"], "Form", "dropdown", "Dry, Liquid, Slurry", false, 4}
    # Fruits, Spices & Flavorings, Sugars and Extracts: none (D65 §4.1: their
    # form is on the product).
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

grain_names = [
  "2-Row",
  "Acidulated",
  "Barley, Roasted",
  "Beech Smoked Malt",
  "Biscuit",
  "Black Malt",
  "Brown Malt",
  "Carafa 3 - dehusked",
  "Caramunich 1",
  "Caramunich 2",
  "Caramunich 3",
  "CaraRed",
  "CaraRuby",
  "Chocolate Malt",
  "Crystal Dark (94L-107L)",
  "Crystal Light (36L-43L)",
  "Crystal Medium (63L-72L)",
  "Dextrin",
  "English Pale",
  "Honey Malt",
  "Maris Otter",
  "Melanoidin Malt",
  "Munich 4",
  "Munich 10",
  "Munich Barke",
  "Munich Malt 1",
  "Munich Malt 2",
  "Oats, Flaked",
  "Oats, Malted",
  "Pilsner",
  "Pilsner-Barke",
  "Rye Malt",
  "Special B",
  "Vienna Malt",
  "Wheat, Extra Pale",
  "Wheat, Torrified",
  "Wheat, Munich",
  "Wheat, White"
]

# D60 §3.1: Grains' five children, in this order.
grain_children = ["Base", "Crystal/Caramel", "Kilned", "Specialty", "Roasted"]

grain_children
|> Enum.with_index()
|> Enum.each(fn {name, sort_order} ->
  if is_nil(Repo.get_by(IngredientCategory, name: name)) do
    Repo.insert!(%IngredientCategory{
      name: name,
      sort_order: sort_order,
      parent_id: category_ids["grains"]
    })
  end
end)

grain_category_ids =
  Repo.all(
    from c in IngredientCategory,
      where: c.id == ^category_ids["grains"] or c.parent_id == ^category_ids["grains"],
      select: c.id
  )

# A grain is on Grains or one of its children; only names on neither are new
# (the unique index is name + category, so a moved grain would come back).
existing_grains =
  Repo.all(from i in Ingredient, where: i.category_id in ^grain_category_ids, select: i.name)
  |> MapSet.new()

grain_ingredients =
  grain_names
  |> Enum.reject(&MapSet.member?(existing_grains, &1))
  |> Enum.map(fn name ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %{
      category_id: category_ids["grains"],
      name: name,
      notes: nil,
      inserted_at: now,
      updated_at: now
    }
  end)

Repo.insert_all(Ingredient, grain_ingredients,
  on_conflict: :nothing,
  conflict_target: [:name, :category_id]
)

# D60 Appendix A: each grain's child category. Only grains still on the
# Grains parent move, so a later move by hand sticks.
grain_child_of = %{
  "Base" => [
    "2-Row",
    "English Pale",
    "Maris Otter",
    "Pilsner",
    "Pilsner-Barke",
    "Vienna Malt",
    "Munich 4",
    "Munich 10",
    "Munich Barke",
    "Munich Malt 1",
    "Munich Malt 2",
    "Wheat, Extra Pale",
    "Wheat, White",
    "Wheat, Munich",
    "Rye Malt",
    "Oats, Malted"
  ],
  "Crystal/Caramel" => [
    "Caramunich 1",
    "Caramunich 2",
    "Caramunich 3",
    "CaraRed",
    "CaraRuby",
    "Crystal Light (36L-43L)",
    "Crystal Medium (63L-72L)",
    "Crystal Dark (94L-107L)",
    "Special B",
    "Dextrin"
  ],
  "Kilned" => ["Biscuit", "Melanoidin Malt", "Honey Malt"],
  "Specialty" => ["Acidulated", "Beech Smoked Malt", "Oats, Flaked", "Wheat, Torrified"],
  "Roasted" => [
    "Barley, Roasted",
    "Black Malt",
    "Chocolate Malt",
    "Carafa 3 - dehusked",
    "Brown Malt"
  ]
}

for {child, names} <- grain_child_of,
    %IngredientCategory{id: child_id} <- [Repo.get_by(IngredientCategory, name: child)] do
  Repo.update_all(
    from(i in Ingredient, where: i.category_id == ^category_ids["grains"] and i.name in ^names),
    set: [category_id: child_id]
  )
end

# D65 §4.1: Other Consumables' two children (no Acids). Like Grains'
# children, a child renamed or added in Categories is left alone.
for {name, sort_order} <- [{"Water Salts", 0}, {"Finings", 1}],
    is_nil(Repo.get_by(IngredientCategory, name: name)) do
  Repo.insert!(%IngredientCategory{
    name: name,
    sort_order: sort_order,
    parent_id: category_ids["consumables"]
  })
end

consumable_child_ids =
  Repo.all(from c in IngredientCategory, where: c.parent_id == ^category_ids["consumables"])
  |> Map.new(fn c -> {c.name, c.id} end)

# D65 A8 (migration 6's rule): a Whirlfloc still at the top of Other
# Consumables moves into Finings, so the insert below doesn't add a second.
if finings = consumable_child_ids["Finings"] do
  unless Repo.exists?(
           from i in Ingredient, where: i.name == "Whirlfloc" and i.category_id == ^finings
         ) do
    Repo.update_all(
      from(i in Ingredient,
        where: i.name == "Whirlfloc" and i.category_id == ^category_ids["consumables"]
      ),
      set: [category_id: finings]
    )
  end
end

other_ingredients =
  [
    # Hops
    {category_ids["hops"], "Centennial", "Citrus and floral, dual-purpose"},
    {category_ids["hops"], "Cascade", "Classic American, grapefruit and floral"},
    {category_ids["hops"], "Citra", "Tropical, passion fruit, grapefruit"},
    {category_ids["hops"], "Mosaic", "Complex fruit: mango, blueberry, earthy"},
    {category_ids["hops"], "Simcoe", "Pine, earthy, passion fruit"},
    {category_ids["hops"], "Amarillo", "Orange citrus, floral"},
    # Yeast Strains
    {category_ids["yeast"], "US-05", "Clean American ale yeast (Fermentis)"},
    {category_ids["yeast"], "WLP001", "California Ale (White Labs)"},
    {category_ids["yeast"], "Wyeast 1056", "American Ale (Wyeast)"},
    {category_ids["yeast"], "WLP002", "English Ale (White Labs)"},
    # Sugars and Extracts (D65: renamed from "Corn Sugar (Dextrose)")
    {category_ids["sugars"], "Dextrose (Corn Sugar)", "Priming sugar, lightens body"},
    # Other Consumables → Finings (D65 A8; Irish Moss removed)
    {consumable_child_ids["Finings"], "Whirlfloc", "Tablet fining, aids clarity"}
  ]
  |> Enum.map(fn {cat_id, name, notes} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    %{category_id: cat_id, name: name, notes: notes, inserted_at: now, updated_at: now}
  end)

Repo.insert_all(Ingredient, other_ingredients,
  on_conflict: :nothing,
  conflict_target: [:name, :category_id]
)

# D60 §3.4: which features each category's lots and products carry (a
# parent's apply to its children). Grains: five, none required, a standard
# on the product copied to each lot. D62 §3.4: Hops' alpha, beta and oil
# are a typical range on the product and entered on each lot, alpha
# required. Rerunning puts the modes back; sort order and `required` stay.
alias RockcutApi.Ingredients.{CategoryFeatureType, FeatureType}

feature_type_ids = Repo.all(FeatureType) |> Map.new(fn f -> {f.key, f.id} end)

# {key, product mode, lot mode, lot required}
grain = &{&1, "value", "copy", false}

applicability =
  [
    {"grains",
     Enum.map(
       ~w(extract_fgdb color_lovibond diastatic_power_lintner protein_pct moisture_pct),
       grain
     )},
    {"hops",
     [
       {"alpha_acid_pct", "range", "enter", true},
       {"beta_acid_pct", "range", "enter", false},
       {"total_oil_ml_100g", "range", "enter", false}
     ]},
    {"yeast", [grain.("attenuation_pct")]}
  ]
  |> Enum.flat_map(fn {category, features} ->
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    features
    |> Enum.with_index()
    |> Enum.map(fn {{key, product_mode, lot_mode, lot_required}, sort_order} ->
      %{
        category_id: category_ids[category],
        feature_type_id: Map.fetch!(feature_type_ids, key),
        sort_order: sort_order,
        required: false,
        product_mode: product_mode,
        lot_mode: lot_mode,
        lot_required: lot_required,
        inserted_at: now,
        updated_at: now
      }
    end)
  end)

Repo.insert_all(CategoryFeatureType, applicability,
  on_conflict: {:replace, [:product_mode, :lot_mode, :lot_required]},
  conflict_target: [:category_id, :feature_type_id]
)

IO.puts(
  "Seeds complete: #{length(categories)} categories, #{length(field_defs)} field defs, " <>
    "#{length(grain_ingredients) + length(other_ingredients)} new ingredients (no lots)"
)

# D60 §6: maltsters, suppliers, maltster products and supplier offers.
Code.eval_file(Path.join(__DIR__, "seeds/grain_reference.exs"))

# D62 §7: hop companies, products with typical ranges, offers, and Matt's
# cooler list as lots (2026-11-19). After the grain reference (BSG).
Code.eval_file(Path.join(__DIR__, "seeds/hop_reference.exs"))

# Grain LOTS are intentionally NOT seeded (D28): prod starts with no grain
# inventory. D60 (task 3843): the malt specs that used to live on lots are the
# maltster products' standard specs in `seeds/grain_reference.exs`. D62: the
# hop lots above are Matt's real cooler count, seeded on every environment.

# ── Accounts: departments + bootstrap owner (idempotent) ─────────────
alias RockcutApi.Accounts
alias RockcutApi.Accounts.{Department, User}

acct_now = DateTime.utc_now() |> DateTime.truncate(:second)

# Real departments are assignable (roles); "Other" is a scheduling-only
# placeholder for cross-department positions (Training, Event-offsite).
# Owners (D59) has tasks, an Idea Board and a channel but no schedule, and
# only owners staff it; its migration makes it on prod, this keeps a fresh
# local DB the same. {name, key, color, assignable, scheduling, owners_only}.
[
  {"Brewery", "brewery", "#B8742A", true, true, false},
  {"Taproom", "bar", "#2E6DB4", true, true, false},
  {"Office", "office", "#3F8F5B", true, true, false},
  {"Sales", "sales", "#7A4FB0", true, true, false},
  {"Other", "other", "#6B7280", false, true, false},
  {"Owners", "owners", "#37474F", true, false, true}
]
|> Enum.each(fn {name, key, color, assignable, scheduling, owners_only} ->
  case Repo.get_by(Department, key: key) do
    nil ->
      Repo.insert!(%Department{
        name: name,
        key: key,
        color: color,
        assignable: assignable,
        scheduling: scheduling,
        owners_only: owners_only,
        inserted_at: acct_now,
        updated_at: acct_now
      })

    %Department{} = dept ->
      changes =
        []
        |> then(fn c -> if is_nil(dept.color), do: [{:color, color} | c], else: c end)
        |> then(fn c ->
          if dept.assignable != assignable, do: [{:assignable, assignable} | c], else: c
        end)
        |> then(fn c ->
          if dept.scheduling != scheduling, do: [{:scheduling, scheduling} | c], else: c
        end)
        |> then(fn c ->
          if dept.owners_only != owners_only, do: [{:owners_only, owners_only} | c], else: c
        end)

      if changes != [], do: dept |> Ecto.Changeset.change(changes) |> Repo.update!()
  end
end)

# Bootstrap owner (prod): seeded from ADMIN_EMAIL + ADMIN_PASSWORD_HASH (hash is
# already Argon2 — copied as-is). There is deliberately NO fallback owner: local
# dev and the DEV server get their owner from the synthetic personas (D30, below).
case {Application.get_env(:rockcut_api, :admin_email),
      Application.get_env(:rockcut_api, :admin_password_hash)} do
  {owner_email, owner_hash} when is_binary(owner_email) and is_binary(owner_hash) ->
    case Accounts.get_user_by_email(owner_email) do
      nil ->
        Repo.insert!(%User{
          email: owner_email,
          name: "Owner",
          password_hash: owner_hash,
          active: true,
          is_owner: true,
          must_reset_password: false,
          inserted_at: acct_now,
          updated_at: acct_now
        })

        IO.puts("Seeded owner: #{owner_email}")

      %User{} = existing ->
        # Never create a second owner; ensure the bootstrap account stays an active owner.
        if not existing.is_owner or not existing.active do
          existing |> Ecto.Changeset.change(is_owner: true, active: true) |> Repo.update!()
        end

        IO.puts("Owner already present: #{owner_email}")
    end

  _ ->
    IO.puts("No ADMIN_EMAIL/ADMIN_PASSWORD_HASH: bootstrap owner skipped.")
end

# ── Brewery: the Daily card's default items (D38, idempotent) ──
# The migration adds them when the Brewery already exists; a fresh DB gets the
# department above, so they're added here. Only when the Brewery has none.
alias RockcutApi.Tasks.DailyItem

with %Department{} = brewery <- Repo.get_by(Department, key: "brewery"),
     false <- Repo.exists?(from i in DailyItem, where: i.department_id == ^brewery.id) do
  DailyItem.defaults()
  |> Enum.with_index(1)
  |> Enum.each(fn {name, position} ->
    Repo.insert!(%DailyItem{
      department_id: brewery.id,
      name: name,
      position: position,
      inserted_at: acct_now,
      updated_at: acct_now
    })
  end)
end

# ── Scheduling: company-wide positions (idempotent) ──
alias RockcutApi.Scheduling.Position

dept_by_key = Repo.all(Department) |> Map.new(fn d -> {d.key, d} end)

group_to_key = %{
  "Brewery" => "brewery",
  "Taproom" => "bar",
  "Office" => "office",
  "Sales" => "sales",
  "Other" => "other"
}

[
  {"Brewer", "Brewery"},
  {"Bar-open", "Taproom"},
  {"Bar-mid", "Taproom"},
  {"Bar-close", "Taproom"},
  {"Event-bar", "Taproom"},
  {"Office", "Office"},
  {"Sales", "Sales"},
  {"Delivery", "Sales"},
  {"Training", "Other"},
  {"Event-offsite", "Other"}
]
|> Enum.each(fn {name, group} ->
  dept = dept_by_key[group_to_key[group]]

  case Repo.get_by(Position, name: name) do
    nil ->
      Repo.insert!(%Position{
        name: name,
        group: group,
        active: true,
        department_id: dept && dept.id,
        inserted_at: acct_now,
        updated_at: acct_now
      })

    %Position{department_id: nil} = pos ->
      pos |> Ecto.Changeset.change(department_id: dept && dept.id) |> Repo.update!()

    _ ->
      :ok
  end
end)

# Standard-hours presets for a few positions (idempotent)
position_by_name = Repo.all(Position) |> Map.new(fn p -> {p.name, p} end)

[
  {"Bar-open", "Open", ~T[08:00:00], ~T[16:00:00]},
  {"Bar-mid", "Mid", ~T[12:00:00], ~T[20:00:00]},
  {"Bar-close", "Close", ~T[17:00:00], ~T[01:00:00]},
  {"Brewer", "Day", ~T[07:00:00], ~T[15:00:00]}
]
|> Enum.each(fn {pos_name, tname, s, e} ->
  pos = position_by_name[pos_name]

  if pos &&
       is_nil(Repo.get_by(RockcutApi.Scheduling.ShiftTemplate, position_id: pos.id, name: tname)) do
    Repo.insert!(%RockcutApi.Scheduling.ShiftTemplate{
      position_id: pos.id,
      name: tname,
      start_time: s,
      end_time: e,
      inserted_at: acct_now,
      updated_at: acct_now
    })
  end
end)

# ── Synthetic personas (D30): local dev / DEV server only ──
# Guarded (never prod) and needs SEED_PASSWORD; otherwise prints how to run it.
alias RockcutApi.Seeds.{Credentials, Guard, Synthetic}

cond do
  not Guard.allowed?() ->
    :ok

  Credentials.fetch() == :error ->
    IO.puts(
      "Synthetic personas skipped: set SEED_PASSWORD (or rockcut_api/.env.synthetic), then run `mix rockcut.synthetic.setup`."
    )

  true ->
    {:ok, count} = Synthetic.setup()
    IO.puts("Synthetic personas seeded: #{count}")
end
