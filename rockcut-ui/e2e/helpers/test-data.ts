import type { APIRequestContext } from '@playwright/test';

const API_BASE = 'http://localhost:4002/api';

export interface TestData {
  brewhouse: { id: number; name: string };
  ingredient: { id: number; name: string };
  lot: { id: number; lot_number: string };
  brand: { id: number; name: string };
  recipe: { id: number };
  recipeIngredient: { id: number };
}

/**
 * Authenticate via API and return a bearer token.
 */
async function getAuthToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_BASE}/session`, {
    data: { email: 'matthewheiser@gmail.com', password: 'rockcut2026' },
  });
  if (!res.ok()) {
    throw new Error(`Auth failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return body.token;
}

/**
 * Look up the "Grain" ingredient category ID by listing all categories.
 */
async function getGrainCategoryId(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<number> {
  const res = await request.get(`${API_BASE}/ingredient_categories`, { headers });
  if (!res.ok()) {
    throw new Error(`Failed to list categories: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  const grain = body.data.find((c: { name: string }) => c.name === 'Grain');
  if (!grain) {
    throw new Error('Grain category not found in seed data');
  }
  return grain.id;
}

/**
 * Create all test data via API calls, return IDs for assertions.
 *
 * Creates in dependency order:
 * 1. Brewhouse
 * 2. Ingredient (in Grain category)
 * 3. Lot on that ingredient
 * 4. Brand linked to the test brewhouse
 * 5. Recipe on that brand
 * 6. RecipeIngredient linking recipe to lot
 */
export async function setupTestData(request: APIRequestContext): Promise<TestData> {
  const token = await getAuthToken(request);
  const headers = { Authorization: `Bearer ${token}` };

  // 1. Get Grain category ID from seed data
  const grainCategoryId = await getGrainCategoryId(request, headers);

  // 2. Create test brewhouse
  const brewhouseRes = await request.post(`${API_BASE}/brewhouses`, {
    headers,
    data: {
      name: 'PW Test Brewhouse',
      is_default: false,
      temp_unit: 'F',
      liquid_vol_unit: 'bbls',
      density_unit: 'sg',
      alcohol_unit: 'abv',
      density_calc_method: 'ppg',
      ibu_calc_method: 'tinseth',
      ingredient_weight_unit: 'lb',
      ingredient_vol_unit: 'gal',
      kettle_turn_size: 7,
      kettle_evaporation_rate: 0.5,
      kettle_loss: 0.25,
      ferm_loss: 0.125,
    },
  });
  if (!brewhouseRes.ok()) {
    throw new Error(`Failed to create brewhouse: ${brewhouseRes.status()} ${await brewhouseRes.text()}`);
  }
  const brewhouse = (await brewhouseRes.json()).data;

  // 3. Create test grain ingredient
  const ingredientRes = await request.post(`${API_BASE}/ingredients`, {
    headers,
    data: {
      name: 'PW Test 2-Row',
      category_id: grainCategoryId,
      notes: 'Playwright test grain ingredient',
    },
  });
  if (!ingredientRes.ok()) {
    throw new Error(`Failed to create ingredient: ${ingredientRes.status()} ${await ingredientRes.text()}`);
  }
  const ingredient = (await ingredientRes.json()).data;

  // 4. Create test lot on that ingredient
  const lotRes = await request.post(`${API_BASE}/ingredient_lots`, {
    headers,
    data: {
      ingredient_id: ingredient.id,
      lot_number: 'PW-001',
      supplier: 'PW Test Supplier',
      received_date: '2026-01-15',
      status: 'available',
      potential_gravity: 1.037,
      color_lovibond: 1.8,
      alpha_acid: null,
      attenuation: null,
    },
  });
  if (!lotRes.ok()) {
    throw new Error(`Failed to create lot: ${lotRes.status()} ${await lotRes.text()}`);
  }
  const lot = (await lotRes.json()).data;

  // 5. Create test brand linked to brewhouse
  const brandRes = await request.post(`${API_BASE}/brands`, {
    headers,
    data: {
      name: 'PW Test IPA',
      style: 'IPA',
      description: 'Playwright test brand',
      target_abv: 6.5,
      target_ibu: 65,
      target_srm: 8,
      status: 'active',
      brewhouse_id: brewhouse.id,
    },
  });
  if (!brandRes.ok()) {
    throw new Error(`Failed to create brand: ${brandRes.status()} ${await brandRes.text()}`);
  }
  const brand = (await brandRes.json()).data;

  // 6. Create test recipe on that brand
  const recipeRes = await request.post(`${API_BASE}/recipes`, {
    headers,
    data: {
      brand_id: brand.id,
      batch_size: 7,
      batch_size_unit: 'bbls',
      boil_time: 60,
      efficiency_target: 75,
      status: 'active',
      is_default: true,
    },
  });
  if (!recipeRes.ok()) {
    throw new Error(`Failed to create recipe: ${recipeRes.status()} ${await recipeRes.text()}`);
  }
  const recipe = (await recipeRes.json()).data;

  // 7. Add ingredient lot to recipe
  const riRes = await request.post(`${API_BASE}/recipe_ingredients`, {
    headers,
    data: {
      recipe_id: recipe.id,
      lot_id: lot.id,
      amount: 200,
      unit: 'lb',
      use: 'mash',
      time_minutes: 60,
      sort_order: 0,
    },
  });
  if (!riRes.ok()) {
    throw new Error(`Failed to create recipe_ingredient: ${riRes.status()} ${await riRes.text()}`);
  }
  const recipeIngredient = (await riRes.json()).data;

  return {
    brewhouse: { id: brewhouse.id, name: brewhouse.name },
    ingredient: { id: ingredient.id, name: ingredient.name },
    lot: { id: lot.id, lot_number: lot.lot_number },
    brand: { id: brand.id, name: brand.name },
    recipe: { id: recipe.id },
    recipeIngredient: { id: recipeIngredient.id },
  };
}

/**
 * Delete all test data in reverse dependency order.
 *
 * Order: recipeIngredient → recipe → brand → lot → ingredient → brewhouse
 *
 * Silently ignores 404s (already deleted or never created).
 */
export async function teardownTestData(
  request: APIRequestContext,
  data: TestData,
): Promise<void> {
  const token = await getAuthToken(request);
  const headers = { Authorization: `Bearer ${token}` };

  const deleteEntity = async (endpoint: string, id: number) => {
    const res = await request.delete(`${API_BASE}/${endpoint}/${id}`, { headers });
    // 204 = success, 404 = already gone — both OK
    if (!res.ok() && res.status() !== 404) {
      console.warn(`Warning: failed to delete ${endpoint}/${id}: ${res.status()}`);
    }
  };

  await deleteEntity('recipe_ingredients', data.recipeIngredient.id);
  await deleteEntity('recipes', data.recipe.id);
  await deleteEntity('brands', data.brand.id);
  await deleteEntity('ingredient_lots', data.lot.id);
  await deleteEntity('ingredients', data.ingredient.id);
  await deleteEntity('brewhouses', data.brewhouse.id);
}
