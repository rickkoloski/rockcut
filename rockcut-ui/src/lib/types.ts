// TypeScript interfaces matching API JSON shapes (json_helpers.ex)

export interface Brand {
  id: number
  name: string
  style: string | null
  description: string | null
  target_abv: number | null
  target_ibu: number | null
  target_srm: number | null
  status: string
  inserted_at: string
  updated_at: string
}

export interface Recipe {
  id: number
  brand_id: number
  brand: Brand | null
  version_major: number
  version_minor: number
  version: string
  batch_size: number
  batch_size_unit: string
  boil_time: number
  efficiency_target: number | null
  status: string
  notes: string | null
  recipe_ingredients: RecipeIngredient[] | null
  mash_steps: MashStep[] | null
  process_steps: ProcessStep[] | null
  water_profile: WaterProfile | null
  inserted_at: string
  updated_at: string
}

export interface RecipeIngredient {
  id: number
  recipe_id: number
  lot_id: number
  lot: IngredientLot | null
  amount: number
  unit: string
  use: string | null
  time_minutes: number | null
  sort_order: number
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface MashStep {
  id: number
  recipe_id: number
  step_number: number
  name: string
  temperature: number
  duration: number
  type: string
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface ProcessStep {
  id: number
  recipe_id: number
  step_number: number
  name: string
  day: number | null
  temperature: number | null
  duration: number | null
  duration_unit: string
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface WaterProfile {
  id: number
  recipe_id: number
  calcium: number | null
  magnesium: number | null
  sodium: number | null
  sulfate: number | null
  chloride: number | null
  bicarbonate: number | null
  ph_target: number | null
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface IngredientCategory {
  id: number
  name: string
  sort_order: number
  field_definitions: CategoryFieldDefinition[] | null
  inserted_at: string
  updated_at: string
}

export interface CategoryFieldDefinition {
  id: number
  category_id: number
  field_name: string
  field_type: string
  options: string | null
  required: boolean
  sort_order: number
  inserted_at: string
  updated_at: string
}

export interface Ingredient {
  id: number
  name: string
  category_id: number
  category: { id: number; name: string } | null
  notes: string | null
  lots: IngredientLotSummary[] | null
  inserted_at: string
  updated_at: string
}

export interface IngredientLotSummary {
  id: number
  lot_number: string | null
  supplier: string | null
  status: string
  alpha_acid: number | null
  color_lovibond: number | null
  potential_gravity: number | null
  attenuation: number | null
}

export interface IngredientLot {
  id: number
  ingredient_id: number
  ingredient: { id: number; name: string; category: { id: number; name: string } | null } | null
  lot_number: string | null
  supplier: string | null
  received_date: string | null
  status: string
  alpha_acid: number | null
  color_lovibond: number | null
  potential_gravity: number | null
  attenuation: number | null
  properties: Record<string, unknown> | null
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface Batch {
  id: number
  brand_id: number
  brand: Brand | null
  batch_number: string
  status: string
  actual_og: number | null
  actual_fg: number | null
  actual_abv: number | null
  actual_volume: number | null
  ferm_start_date: string | null
  ferm_end_date: string | null
  ferm_temp: number | null
  package_date: string | null
  package_type: string | null
  rating: number | null
  tasting_notes: string | null
  notes: string | null
  brew_turns: BrewTurn[] | null
  inserted_at: string
  updated_at: string
}

export interface BrewTurn {
  id: number
  batch_id: number
  recipe_id: number
  recipe: { id: number; version: string; brand: Brand | null } | null
  turn_number: number
  brew_date: string | null
  actual_og: number | null
  actual_volume: number | null
  actual_efficiency: number | null
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface BatchLogEntry {
  id: number
  batch_id: number
  timestamp: string
  event_type: string
  gravity: number | null
  temperature: number | null
  ph: number | null
  notes: string | null
  inserted_at: string
  updated_at: string
}

export interface ApiResponse<T> {
  data: T
}
