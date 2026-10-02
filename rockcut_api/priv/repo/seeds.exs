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

IO.puts(
  "Seeds complete: #{length(categories)} categories, #{length(field_defs)} field defs, " <>
    "#{length(grain_ingredients) + length(other_ingredients)} ingredients (no lots)"
)

# Ingredient LOTS are intentionally NOT seeded (D28): prod starts with an empty
# inventory, and the ingredient catalog above is the only brewing reference data.
# The malt spec data that used to live on lots (moisture/FGDB/protein/color/
# diastatic) is deferred — see PortableMind Product Backlog task 3843. The prior
# lot dataset remains in git history on the `scheduler-pwa` branch if needed.

# ── Accounts: departments + bootstrap owner (idempotent) ─────────────
alias RockcutApi.Accounts
alias RockcutApi.Accounts.{Department, User}

acct_now = DateTime.utc_now() |> DateTime.truncate(:second)

# Real departments are assignable (roles); "Other" is a scheduling-only
# placeholder for cross-department positions (Training, Event-offsite).
[
  {"Brewery", "brewery", "#B8742A", true},
  {"Taproom", "bar", "#2E6DB4", true},
  {"Office", "office", "#3F8F5B", true},
  {"Sales", "sales", "#7A4FB0", true},
  {"Other", "other", "#6B7280", false}
]
|> Enum.each(fn {name, key, color, assignable} ->
  case Repo.get_by(Department, key: key) do
    nil ->
      Repo.insert!(%Department{name: name, key: key, color: color, assignable: assignable, inserted_at: acct_now, updated_at: acct_now})

    %Department{} = dept ->
      changes =
        []
        |> then(fn c -> if is_nil(dept.color), do: [{:color, color} | c], else: c end)
        |> then(fn c -> if dept.assignable != assignable, do: [{:assignable, assignable} | c], else: c end)

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

# ── Scheduling: company-wide positions (idempotent) ──
alias RockcutApi.Scheduling.Position

dept_by_key = Repo.all(Department) |> Map.new(fn d -> {d.key, d} end)
group_to_key = %{"Brewery" => "brewery", "Taproom" => "bar", "Office" => "office", "Sales" => "sales", "Other" => "other"}

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
      Repo.insert!(%Position{name: name, group: group, active: true, department_id: dept && dept.id, inserted_at: acct_now, updated_at: acct_now})

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

  if pos && is_nil(Repo.get_by(RockcutApi.Scheduling.ShiftTemplate, position_id: pos.id, name: tname)) do
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
    IO.puts("Synthetic personas skipped: set SEED_PASSWORD (or rockcut_api/.env.synthetic), then run `mix rockcut.synthetic.setup`.")

  true ->
    {:ok, count} = Synthetic.setup()
    IO.puts("Synthetic personas seeded: #{count}")
end
