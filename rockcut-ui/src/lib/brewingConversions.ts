/**
 * Brewing Conversion Utilities
 *
 * Pure functions for extract unit conversions and other brewing math.
 * No React dependency — reusable in hooks, tests, and server-side code.
 *
 * Conversion hub: CGAI (Coarse Grind As-Is) is the central unit.
 * All paths go through CGAI:
 *
 *   FGDB = CGAI x (1 + moisture)
 *   PPG  = CGAI x 46
 *   L/kg = PPG  x 8.345
 */

export type ExtractMeasurement = 'cgai' | 'fgdb' | 'ppg' | 'l_deg_kg'

export interface ExtractValues {
  cgai: number | null
  fgdb: number | null
  ppg: number | null
  l_deg_kg: number | null
}

// ----- Extract Conversion Constants -----

/** PPG per unit CGAI (points per gallon per pound) */
const CGAI_TO_PPG = 46

/** L-deg/kg per unit PPG */
const PPG_TO_L_DEG_KG = 8.345

// ----- Core Conversion Function -----

/**
 * Convert an extract value from one measurement system to all four.
 *
 * @param source   - which unit the input value is in
 * @param value    - the numeric value in the source unit
 * @param moisture - moisture as a decimal (e.g., 0.04 for 4%)
 * @returns all four extract values computed from the source
 */
export function convertExtract(
  source: ExtractMeasurement,
  value: number,
  moisture: number,
): ExtractValues {
  // Step 1: Normalize to CGAI
  let cgai: number

  switch (source) {
    case 'cgai':
      cgai = value
      break
    case 'fgdb':
      // CGAI = FGDB / (1 + moisture)
      cgai = value / (1 + moisture)
      break
    case 'ppg':
      // CGAI = PPG / 46
      cgai = value / CGAI_TO_PPG
      break
    case 'l_deg_kg':
      // PPG = L/kg / 8.345, then CGAI = PPG / 46
      cgai = value / PPG_TO_L_DEG_KG / CGAI_TO_PPG
      break
  }

  // Step 2: Compute all four from CGAI
  const fgdb = cgai * (1 + moisture)
  const ppg = cgai * CGAI_TO_PPG
  const l_deg_kg = ppg * PPG_TO_L_DEG_KG

  return { cgai, fgdb, ppg, l_deg_kg }
}

// ----- Gravity / Alcohol Conversions -----

/**
 * Convert specific gravity to degrees Plato.
 * Uses the simplified linear approximation widely used in brewing.
 *
 * More precise polynomial:
 *   P = -676.0720 + 1286.4830*SG - 800.4172*SG^2 + 190.0132*SG^3
 * Simplified (accurate to ~0.1 P for typical brewing range):
 *   P = (SG - 1) * 1000 / 4    -- very rough
 * We use the standard polynomial for better accuracy.
 */
export function sgToPlato(sg: number): number {
  return (
    -676.0720 +
    1286.4830 * sg -
    800.4172 * sg * sg +
    190.0132 * sg * sg * sg
  )
}

/**
 * Convert degrees Plato to specific gravity.
 * Uses the standard approximation.
 *
 *   SG = 1 + (P / (258.6 - (P * 227.1 / 258.2)))
 */
export function platoToSg(plato: number): number {
  return 1 + plato / (258.6 - (plato * 227.1) / 258.2)
}

/**
 * Calculate Alcohol By Volume (ABV) from original and final gravity.
 * Uses the standard simplified formula:
 *   ABV = (OG - FG) * 131.25
 *
 * @param og - original gravity (e.g. 1.050)
 * @param fg - final gravity (e.g. 1.010)
 * @returns ABV as a percentage (e.g. 5.25)
 */
export function calcAbv(og: number, fg: number): number {
  return (og - fg) * 131.25
}

/**
 * Calculate Alcohol By Weight (ABW) from ABV.
 * ABW = ABV * 0.8 (density of ethanol vs water).
 *
 * @param abv - ABV percentage
 * @returns ABW percentage
 */
export function calcAbw(abv: number): number {
  return abv * 0.8
}

// ----- Display Helpers -----

/** Human-readable label for each extract measurement */
export const EXTRACT_LABELS: Record<ExtractMeasurement, string> = {
  cgai: 'CGAI (%)',
  fgdb: 'FGDB (%)',
  ppg: 'PPG',
  l_deg_kg: 'L\u00B0/kg',
}

/** All measurement options for select dropdowns */
export const EXTRACT_MEASUREMENTS: { value: ExtractMeasurement; label: string }[] = [
  { value: 'cgai', label: 'CGAI (Coarse Grind As-Is)' },
  { value: 'fgdb', label: 'FGDB (Fine Grind Dry Basis)' },
  { value: 'ppg', label: 'PPG (Points/Pound/Gallon)' },
  { value: 'l_deg_kg', label: 'L\u00B0/kg (Liter-degrees/kg)' },
]
