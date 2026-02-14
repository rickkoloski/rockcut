defmodule RockcutApi.Brewing do
  import Ecto.Query
  alias RockcutApi.Repo
  alias RockcutApi.Brewing.{
    IngredientCategory,
    CategoryFieldDefinition,
    Ingredient,
    IngredientLot,
    Brand,
    Recipe,
    RecipeIngredient,
    MashStep,
    RecipeProcessStep,
    WaterProfile,
    Batch,
    BrewTurn,
    BatchLogEntry
  }

  # ── Ingredient Categories ──────────────────────────────────────────

  def list_ingredient_categories do
    IngredientCategory
    |> order_by(:sort_order)
    |> Repo.all()
  end

  def get_ingredient_category!(id) do
    IngredientCategory
    |> Repo.get!(id)
    |> Repo.preload(field_definitions: from(d in CategoryFieldDefinition, order_by: d.sort_order))
  end

  def create_ingredient_category(attrs) do
    %IngredientCategory{}
    |> IngredientCategory.changeset(attrs)
    |> Repo.insert()
  end

  def update_ingredient_category(%IngredientCategory{} = category, attrs) do
    category
    |> IngredientCategory.changeset(attrs)
    |> Repo.update()
  end

  def delete_ingredient_category(%IngredientCategory{} = category) do
    Repo.delete(category)
  end

  # ── Category Field Definitions ─────────────────────────────────────

  def list_category_field_definitions(category_id) do
    CategoryFieldDefinition
    |> where(category_id: ^category_id)
    |> order_by(:sort_order)
    |> Repo.all()
  end

  def get_category_field_definition!(id) do
    Repo.get!(CategoryFieldDefinition, id)
  end

  def create_category_field_definition(attrs) do
    %CategoryFieldDefinition{}
    |> CategoryFieldDefinition.changeset(attrs)
    |> Repo.insert()
  end

  def update_category_field_definition(%CategoryFieldDefinition{} = definition, attrs) do
    definition
    |> CategoryFieldDefinition.changeset(attrs)
    |> Repo.update()
  end

  def delete_category_field_definition(%CategoryFieldDefinition{} = definition) do
    Repo.delete(definition)
  end

  # ── Ingredients ────────────────────────────────────────────────────

  def list_ingredients(params \\ %{}) do
    Ingredient
    |> maybe_filter_by(:category_id, params)
    |> order_by(:name)
    |> preload(:category)
    |> Repo.all()
  end

  def get_ingredient!(id) do
    Ingredient
    |> Repo.get!(id)
    |> Repo.preload([:category, lots: from(l in IngredientLot, order_by: [desc: l.received_date])])
  end

  def create_ingredient(attrs) do
    %Ingredient{}
    |> Ingredient.changeset(attrs)
    |> Repo.insert()
    |> preload_on_ok(:category)
  end

  def update_ingredient(%Ingredient{} = ingredient, attrs) do
    ingredient
    |> Ingredient.changeset(attrs)
    |> Repo.update()
    |> preload_on_ok(:category)
  end

  def delete_ingredient(%Ingredient{} = ingredient) do
    Repo.delete(ingredient)
  end

  # ── Ingredient Lots ────────────────────────────────────────────────

  def list_ingredient_lots(params \\ %{}) do
    IngredientLot
    |> maybe_filter_by(:ingredient_id, params)
    |> maybe_filter_by(:status, params)
    |> order_by([l], desc: l.received_date)
    |> preload(ingredient: :category)
    |> Repo.all()
  end

  def get_ingredient_lot!(id) do
    IngredientLot
    |> Repo.get!(id)
    |> Repo.preload(ingredient: :category)
  end

  def create_ingredient_lot(attrs) do
    %IngredientLot{}
    |> IngredientLot.changeset(attrs)
    |> Repo.insert()
    |> preload_on_ok(ingredient: :category)
  end

  def update_ingredient_lot(%IngredientLot{} = lot, attrs) do
    lot
    |> IngredientLot.changeset(attrs)
    |> Repo.update()
    |> preload_on_ok(ingredient: :category)
  end

  def delete_ingredient_lot(%IngredientLot{} = lot) do
    Repo.delete(lot)
  end

  # ── Brands ─────────────────────────────────────────────────────────

  def list_brands do
    Brand
    |> order_by(:name)
    |> Repo.all()
  end

  def get_brand!(id) do
    Repo.get!(Brand, id)
  end

  def create_brand(attrs) do
    %Brand{}
    |> Brand.changeset(attrs)
    |> Repo.insert()
  end

  def update_brand(%Brand{} = brand, attrs) do
    brand
    |> Brand.changeset(attrs)
    |> Repo.update()
  end

  def delete_brand(%Brand{} = brand) do
    Repo.delete(brand)
  end

  # ── Recipes ────────────────────────────────────────────────────────

  def list_recipes(params \\ %{}) do
    Recipe
    |> maybe_filter_by(:brand_id, params)
    |> maybe_filter_by(:status, params)
    |> order_by([r], [desc: r.version_major, desc: r.version_minor])
    |> preload(:brand)
    |> Repo.all()
  end

  def get_recipe!(id) do
    Recipe
    |> Repo.get!(id)
    |> Repo.preload([
      :brand,
      :water_profile,
      recipe_ingredients: {from(ri in RecipeIngredient, order_by: ri.sort_order), lot: {from(l in IngredientLot), ingredient: :category}},
      mash_steps: from(ms in MashStep, order_by: ms.step_number),
      process_steps: from(ps in RecipeProcessStep, order_by: ps.step_number)
    ])
  end

  def create_recipe(attrs) do
    %Recipe{}
    |> Recipe.changeset(attrs)
    |> Repo.insert()
    |> preload_on_ok(:brand)
  end

  def update_recipe(%Recipe{} = recipe, attrs) do
    recipe
    |> Recipe.changeset(attrs)
    |> Repo.update()
    |> preload_on_ok(:brand)
  end

  def delete_recipe(%Recipe{} = recipe) do
    Repo.delete(recipe)
  end

  # ── Recipe Ingredients ─────────────────────────────────────────────

  def list_recipe_ingredients(recipe_id) do
    RecipeIngredient
    |> where(recipe_id: ^recipe_id)
    |> order_by(:sort_order)
    |> preload(lot: [ingredient: :category])
    |> Repo.all()
  end

  def get_recipe_ingredient!(id) do
    RecipeIngredient
    |> Repo.get!(id)
    |> Repo.preload(lot: [ingredient: :category])
  end

  def create_recipe_ingredient(attrs) do
    %RecipeIngredient{}
    |> RecipeIngredient.changeset(attrs)
    |> Repo.insert()
    |> preload_on_ok(lot: [ingredient: :category])
  end

  def update_recipe_ingredient(%RecipeIngredient{} = ri, attrs) do
    ri
    |> RecipeIngredient.changeset(attrs)
    |> Repo.update()
    |> preload_on_ok(lot: [ingredient: :category])
  end

  def delete_recipe_ingredient(%RecipeIngredient{} = ri) do
    Repo.delete(ri)
  end

  # ── Mash Steps ─────────────────────────────────────────────────────

  def list_mash_steps(recipe_id) do
    MashStep
    |> where(recipe_id: ^recipe_id)
    |> order_by(:step_number)
    |> Repo.all()
  end

  def get_mash_step!(id), do: Repo.get!(MashStep, id)

  def create_mash_step(attrs) do
    %MashStep{}
    |> MashStep.changeset(attrs)
    |> Repo.insert()
  end

  def update_mash_step(%MashStep{} = step, attrs) do
    step
    |> MashStep.changeset(attrs)
    |> Repo.update()
  end

  def delete_mash_step(%MashStep{} = step), do: Repo.delete(step)

  # ── Recipe Process Steps ───────────────────────────────────────────

  def list_recipe_process_steps(recipe_id) do
    RecipeProcessStep
    |> where(recipe_id: ^recipe_id)
    |> order_by(:step_number)
    |> Repo.all()
  end

  def get_recipe_process_step!(id), do: Repo.get!(RecipeProcessStep, id)

  def create_recipe_process_step(attrs) do
    %RecipeProcessStep{}
    |> RecipeProcessStep.changeset(attrs)
    |> Repo.insert()
  end

  def update_recipe_process_step(%RecipeProcessStep{} = step, attrs) do
    step
    |> RecipeProcessStep.changeset(attrs)
    |> Repo.update()
  end

  def delete_recipe_process_step(%RecipeProcessStep{} = step), do: Repo.delete(step)

  # ── Water Profiles ─────────────────────────────────────────────────

  def get_water_profile_by_recipe(recipe_id) do
    Repo.get_by(WaterProfile, recipe_id: recipe_id)
  end

  def get_water_profile!(id), do: Repo.get!(WaterProfile, id)

  def create_water_profile(attrs) do
    %WaterProfile{}
    |> WaterProfile.changeset(attrs)
    |> Repo.insert()
  end

  def update_water_profile(%WaterProfile{} = profile, attrs) do
    profile
    |> WaterProfile.changeset(attrs)
    |> Repo.update()
  end

  def delete_water_profile(%WaterProfile{} = profile), do: Repo.delete(profile)

  # ── Batches ────────────────────────────────────────────────────────

  @batch_preloads [:brand, brew_turns: {from(t in BrewTurn, order_by: t.turn_number), recipe: :brand}]

  def list_batches(params \\ %{}) do
    Batch
    |> maybe_filter_by(:brand_id, params)
    |> maybe_filter_by(:status, params)
    |> order_by([b], desc: b.inserted_at)
    |> preload(^@batch_preloads)
    |> Repo.all()
  end

  def get_batch!(id) do
    Batch
    |> Repo.get!(id)
    |> Repo.preload(@batch_preloads)
  end

  def create_batch(attrs) do
    %Batch{}
    |> Batch.changeset(attrs)
    |> Repo.insert()
    |> preload_on_ok(@batch_preloads)
  end

  def update_batch(%Batch{} = batch, attrs) do
    batch
    |> Batch.changeset(attrs)
    |> Repo.update()
    |> preload_on_ok(@batch_preloads)
  end

  def delete_batch(%Batch{} = batch), do: Repo.delete(batch)

  # ── Brew Turns ─────────────────────────────────────────────────────

  def list_brew_turns(batch_id) do
    BrewTurn
    |> where(batch_id: ^batch_id)
    |> order_by(:turn_number)
    |> preload(recipe: :brand)
    |> Repo.all()
  end

  def get_brew_turn!(id) do
    BrewTurn
    |> Repo.get!(id)
    |> Repo.preload(recipe: :brand)
  end

  def create_brew_turn(attrs) do
    %BrewTurn{}
    |> BrewTurn.changeset(attrs)
    |> Repo.insert()
    |> preload_on_ok(recipe: :brand)
  end

  def update_brew_turn(%BrewTurn{} = turn, attrs) do
    turn
    |> BrewTurn.changeset(attrs)
    |> Repo.update()
    |> preload_on_ok(recipe: :brand)
  end

  def delete_brew_turn(%BrewTurn{} = turn), do: Repo.delete(turn)

  # ── Batch Log Entries ──────────────────────────────────────────────

  def list_batch_log_entries(batch_id) do
    BatchLogEntry
    |> where(batch_id: ^batch_id)
    |> order_by(:timestamp)
    |> Repo.all()
  end

  def get_batch_log_entry!(id), do: Repo.get!(BatchLogEntry, id)

  def create_batch_log_entry(attrs) do
    %BatchLogEntry{}
    |> BatchLogEntry.changeset(attrs)
    |> Repo.insert()
  end

  def update_batch_log_entry(%BatchLogEntry{} = entry, attrs) do
    entry
    |> BatchLogEntry.changeset(attrs)
    |> Repo.update()
  end

  def delete_batch_log_entry(%BatchLogEntry{} = entry), do: Repo.delete(entry)

  # ── Helpers ────────────────────────────────────────────────────────

  defp maybe_filter_by(query, field, params) do
    key = to_string(field)

    case Map.get(params, key) || Map.get(params, field) do
      nil -> query
      "" -> query
      value -> where(query, ^[{field, value}])
    end
  end

  defp preload_on_ok({:ok, record}, preloads), do: {:ok, Repo.preload(record, preloads)}
  defp preload_on_ok(error, _preloads), do: error
end
