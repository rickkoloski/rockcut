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

  # D60: a lot's specs are feature values, rendered as a map by feature key;
  # its product names it ("Rahr · lot #" in the recipe lot picker).
  @lot_features [feature_values: :feature_type, product: [:manufacturer, :ingredient]]
  @lot_with_category [{:ingredient, :category} | @lot_features]

  # ── Ingredient Categories ──────────────────────────────────────────

  def list_ingredient_categories do
    IngredientCategory
    |> order_by(:sort_order)
    |> Repo.all()
    |> put_category_delete_blocked()
  end

  def get_ingredient_category!(id) do
    IngredientCategory
    |> Repo.get!(id)
    |> Repo.preload(field_definitions: from(d in CategoryFieldDefinition, order_by: d.sort_order))
    |> put_category_delete_blocked()
  end

  # D55 lead decisions 6 (gap 8): a `sort_order` that is null or "" (or
  # missing on create) puts the category at the end, as for fields (§2.10).
  # D60 lead decisions 2: the end among its siblings (a new Grains child after
  # Grains' other children; a top-level category after the top level).
  def create_ingredient_category(attrs) do
    %IngredientCategory{sort_order: nil}
    |> IngredientCategory.changeset(attrs)
    |> put_end_category_order()
    |> Repo.insert()
  end

  def update_ingredient_category(%IngredientCategory{} = category, attrs) do
    category
    |> IngredientCategory.changeset(attrs)
    |> put_end_category_order()
    |> Repo.update()
    |> case do
      {:ok, category} -> {:ok, put_category_delete_blocked(category)}
      error -> error
    end
  end

  @doc """
  Delete a category with no ingredients and no sub-categories; otherwise a
  422 saying what to move first (D60 lead decisions 2, gap 12: was a 500).
  """
  def delete_ingredient_category(%IngredientCategory{} = category) do
    case put_category_delete_blocked(category).delete_blocked do
      nil -> Repo.delete(category)
      refusal -> {:error, {:invalid, %{base: [refusal]}}}
    end
  end

  @doc """
  Fill each category's virtual `delete_blocked` (D61 carry-over 2): the
  refusal `delete_ingredient_category/1` would give, or nil. Two queries.
  """
  def put_category_delete_blocked(categories) when is_list(categories) do
    ids = Enum.map(categories, & &1.id)

    parents =
      from(c in IngredientCategory,
        where: c.parent_id in ^ids,
        distinct: true,
        select: c.parent_id
      )
      |> Repo.all()
      |> MapSet.new()

    with_ingredients =
      from(i in Ingredient, where: i.category_id in ^ids, distinct: true, select: i.category_id)
      |> Repo.all()
      |> MapSet.new()

    Enum.map(categories, fn category ->
      blocked =
        cond do
          MapSet.member?(parents, category.id) ->
            "This category has sub-categories; move or delete them first"

          MapSet.member?(with_ingredients, category.id) ->
            "This category has #{category_contents(category)}; move them first"

          true ->
            nil
        end

      %{category | delete_blocked: blocked}
    end)
  end

  def put_category_delete_blocked(%IngredientCategory{} = category),
    do: hd(put_category_delete_blocked([category]))

  defp category_contents(category) do
    category = Repo.preload(category, :parent)

    if RockcutApi.Ingredients.Catalog.key(category) == "grains",
      do: "grains",
      else: "ingredients"
  end

  defp put_end_category_order(changeset) do
    if is_nil(Ecto.Changeset.get_field(changeset, :sort_order)) do
      parent_id = Ecto.Changeset.get_field(changeset, :parent_id)
      id = Ecto.Changeset.get_field(changeset, :id)

      last =
        IngredientCategory
        |> then(fn q ->
          if parent_id,
            do: where(q, [c], c.parent_id == ^parent_id),
            else: where(q, [c], is_nil(c.parent_id))
        end)
        |> then(fn q -> if id, do: where(q, [c], c.id != ^id), else: q end)
        |> select([c], max(c.sort_order))
        |> Repo.one()

      Ecto.Changeset.put_change(changeset, :sort_order, if(last, do: last + 1, else: 0))
    else
      changeset
    end
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

  # D55 §2.10: a `sort_order` that is null (or missing on create) puts the
  # field at the end of its category's list, as for recipe ingredients.
  def create_category_field_definition(attrs) do
    %CategoryFieldDefinition{sort_order: nil}
    |> CategoryFieldDefinition.changeset(attrs)
    |> put_end_sort_order(CategoryFieldDefinition, :category_id)
    |> Repo.insert()
  end

  def update_category_field_definition(%CategoryFieldDefinition{} = definition, attrs) do
    definition
    |> CategoryFieldDefinition.changeset(attrs)
    |> put_end_sort_order(CategoryFieldDefinition, :category_id)
    |> Repo.update()
  end

  def delete_category_field_definition(%CategoryFieldDefinition{} = definition) do
    Repo.delete(definition)
  end

  # ── Ingredients ────────────────────────────────────────────────────

  def list_ingredients(params \\ %{}) do
    Ingredient
    |> filter_category(params["category_id"] || params[:category_id])
    |> order_by(:name)
    |> preload([
      :category,
      lots: ^from(l in IngredientLot, order_by: [desc: l.received_date], preload: ^@lot_features)
    ])
    |> Repo.all()
    |> put_ingredient_delete_blocked()
  end

  def get_ingredient!(id) do
    Ingredient
    |> Repo.get!(id)
    |> Repo.preload([
      :category,
      lots: from(l in IngredientLot, order_by: [desc: l.received_date], preload: ^@lot_features)
    ])
    |> put_ingredient_delete_blocked()
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

  @doc """
  D65 lead decisions 1 (gap 13): an ingredient with products (or lots) is
  refused with a sentence, never the foreign key's 500.
  """
  def delete_ingredient(%Ingredient{} = ingredient) do
    case put_ingredient_delete_blocked(ingredient).delete_blocked do
      nil -> Repo.delete(ingredient)
      refusal -> {:error, {:invalid, %{base: [refusal]}}}
    end
  end

  @doc """
  Fill each ingredient's virtual `delete_blocked`: the refusal
  `delete_ingredient/1` would give, or nil. Two queries.
  """
  def put_ingredient_delete_blocked(ingredients) when is_list(ingredients) do
    ids = Enum.map(ingredients, & &1.id)
    used = fn query -> query |> distinct(true) |> Repo.all() |> MapSet.new() end

    with_products =
      used.(
        from(p in RockcutApi.Ingredients.Product,
          where: p.ingredient_id in ^ids,
          select: p.ingredient_id
        )
      )

    with_lots =
      used.(from(l in IngredientLot, where: l.ingredient_id in ^ids, select: l.ingredient_id))

    Enum.map(ingredients, fn ing ->
      blocked =
        cond do
          MapSet.member?(with_products, ing.id) ->
            "#{ing.name} has products; deactivate them instead"

          MapSet.member?(with_lots, ing.id) ->
            "#{ing.name} has lots; it can't be deleted"

          true ->
            nil
        end

      %{ing | delete_blocked: blocked}
    end)
  end

  def put_ingredient_delete_blocked(%Ingredient{} = ingredient),
    do: hd(put_ingredient_delete_blocked([ingredient]))

  # ── Ingredient Lots ────────────────────────────────────────────────

  def list_ingredient_lots(params \\ %{}) do
    IngredientLot
    |> maybe_filter_by(:ingredient_id, params)
    |> maybe_filter_by(:status, params)
    |> order_by([l], desc: l.received_date)
    |> preload(^@lot_with_category)
    |> Repo.all()
  end

  def get_ingredient_lot!(id) do
    IngredientLot
    |> Repo.get!(id)
    |> Repo.preload(@lot_with_category)
  end

  def create_ingredient_lot(attrs) do
    %IngredientLot{}
    |> IngredientLot.changeset(attrs)
    |> Repo.insert()
    |> preload_on_ok(@lot_with_category)
  end

  def update_ingredient_lot(%IngredientLot{} = lot, attrs) do
    lot
    |> IngredientLot.changeset(attrs)
    |> Repo.update()
    |> preload_on_ok(@lot_with_category)
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
    # D49: a rename retitles its batches' Brewery board tasks.
    RockcutApi.Production.TaskLink.with_sync(fn ->
      brand
      |> Brand.changeset(attrs)
      |> Repo.update()
    end)
  end

  def delete_brand(%Brand{} = brand) do
    Repo.delete(brand)
  end

  # ── Recipes ────────────────────────────────────────────────────────

  def list_recipes(params \\ %{}) do
    Recipe
    |> maybe_filter_by(:brand_id, params)
    |> maybe_filter_by(:status, params)
    |> order_by([r], desc: r.version_major, desc: r.version_minor)
    |> preload(:brand)
    |> Repo.all()
  end

  def get_recipe!(id) do
    Recipe
    |> Repo.get!(id)
    |> Repo.preload([
      :brand,
      :water_profile,
      recipe_ingredients:
        {from(ri in RecipeIngredient, order_by: ri.sort_order),
         lot: {from(l in IngredientLot), @lot_with_category}},
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
    |> preload(^[lot: @lot_with_category])
    |> Repo.all()
  end

  def get_recipe_ingredient!(id) do
    RecipeIngredient
    |> Repo.get!(id)
    |> Repo.preload(lot: @lot_with_category)
  end

  # D55 §2.5 (task 4981): a `sort_order` that is null (or missing on create)
  # puts the ingredient at the end of its recipe's list.
  def create_recipe_ingredient(attrs) do
    %RecipeIngredient{sort_order: nil}
    |> RecipeIngredient.changeset(attrs)
    |> put_end_sort_order(RecipeIngredient, :recipe_id)
    |> Repo.insert()
    |> preload_on_ok(lot: @lot_with_category)
  end

  def update_recipe_ingredient(%RecipeIngredient{} = ri, attrs) do
    ri
    |> RecipeIngredient.changeset(attrs)
    |> put_end_sort_order(RecipeIngredient, :recipe_id)
    |> Repo.update()
    |> preload_on_ok(lot: @lot_with_category)
  end

  # A nil `sort_order` becomes one after the last row with the same `parent`
  # (not counting the row itself), or 0 for the first. A nil `parent` means
  # every row of `schema` (ingredient categories have no parent).
  defp put_end_sort_order(changeset, schema, parent) do
    parent_id = if parent, do: Ecto.Changeset.get_field(changeset, parent)

    if is_nil(Ecto.Changeset.get_field(changeset, :sort_order)) and (parent_id || !parent) do
      id = Ecto.Changeset.get_field(changeset, :id)

      last =
        schema
        |> then(fn q ->
          if parent, do: where(q, [r], field(r, ^parent) == ^parent_id), else: q
        end)
        |> then(fn q -> if id, do: where(q, [r], r.id != ^id), else: q end)
        |> select([r], max(r.sort_order))
        |> Repo.one()

      Ecto.Changeset.put_change(changeset, :sort_order, if(last, do: last + 1, else: 0))
    else
      changeset
    end
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

  @batch_preloads [
    :brand,
    brew_turns: {from(t in BrewTurn, order_by: t.turn_number), recipe: :brand}
  ]

  @doc """
  The batches for the old Batches page and the Brewery Dashboard. Batches on
  the production schedule (D47, with `batch_vessels`) aren't listed: those
  pages are on their way out (lead decisions 2).
  """
  def list_batches(params \\ %{}) do
    Batch
    |> where(
      [b],
      b.id not in subquery(from(v in RockcutApi.Production.BatchVessel, select: v.batch_id))
    )
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

  # D60 §3.1: a parent category includes its children's ingredients.
  defp filter_category(query, value) when value in [nil, ""], do: query

  defp filter_category(query, id) do
    children = from(c in IngredientCategory, where: c.parent_id == ^id, select: c.id)
    where(query, [i], i.category_id == ^id or i.category_id in subquery(children))
  end

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
