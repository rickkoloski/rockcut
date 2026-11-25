import { parseDecimal, roundString } from './brewingUnits'
import { localDayKey } from './datetime'
import parseApiError from './parseApiError'

// D63 §6: the brewery's settings (Brewery → Settings). The API
// (`BrewerySettings.Settings`) holds the same limits and decimals.

export type IbuEquation = 'rc_2026' | 'tinseth' | 'modified_tinseth'

export const IBU_EQUATIONS: { value: IbuEquation; label: string }[] = [
  { value: 'rc_2026', label: 'RC 2026' },
  { value: 'tinseth', label: 'Tinseth' },
  { value: 'modified_tinseth', label: 'Modified Tinseth' },
]

/** The numbers are strings, as stored ("0.09375"). */
export interface BrewerySettings {
  [key: string]: unknown
  ibu_equation_hold: IbuEquation
  ibu_equation_print: IbuEquation
  source_water_name: string
  lock_version: number
  updated_by: { id: number; name: string } | null
  updated_at: string
}

export interface BrewerySettingsReply {
  data: BrewerySettings
  can_manage: boolean
}

export interface NumberField {
  key: string
  label: string
  unit?: string
  /** Limits (inclusive) in the stored unit. */
  min: number
  max: number
  /** Decimals as shown and typed. */
  decimals: number
  /** Shown and typed as the stored value × this (zinc: per 8 bbl). */
  scale?: number
}

export interface EquationField {
  key: 'ibu_equation_hold' | 'ibu_equation_print'
  label: string
  equation: true
}

export type SettingField = NumberField | EquationField

export const isEquation = (f: SettingField): f is EquationField => 'equation' in f

const minutes = (key: string, label: string): NumberField => ({ key, label, unit: 'min', min: 0, max: 120, decimals: 0 })
const ppm = (key: string, label: string): NumberField => ({ key, label, unit: 'ppm', min: 0, max: 2000, decimals: 2 })
const bbl = (key: string, label: string): NumberField => ({ key, label, unit: 'bbl', min: 0, max: 5, decimals: 2 })

export const SETTING_GROUPS: { title: string; testId: string; fields: SettingField[] }[] = [
  {
    title: 'Boil and hops',
    testId: 'boil',
    fields: [
      { key: 'boil_temp_f', label: 'Boil temperature', unit: '°F', min: 180, max: 212, decimals: 1 },
      { key: 'ibu_equation_hold', label: 'IBU equation to hold', equation: true },
      { key: 'ibu_equation_print', label: 'IBU equation to print', equation: true },
      { key: 'ibu_tolerance', label: 'IBU tolerance', unit: 'IBU', min: 0, max: 20, decimals: 2 },
      { key: 'pellet_factor', label: 'Pellet factor (T90, Cryo)', min: 1, max: 1.5, decimals: 2 },
      { key: 'hop_stand_temp_f', label: 'Hop stand temperature', unit: '°F', min: 100, max: 212, decimals: 1 },
      minutes('hop_stand_cooling_min', 'Hop stand cooling'),
      minutes('hop_stand_whirl_min', 'Hop stand whirl'),
      minutes('hop_stand_rest_min', 'Hop stand rest'),
      minutes('whirlpool_whirl_min', 'Whirlpool whirl'),
      minutes('whirlpool_rest_min', 'Whirlpool rest'),
    ],
  },
  {
    title: 'Volumes',
    testId: 'volumes',
    fields: [
      { key: 'evaporation_bbl_per_hr', label: 'Evaporation', unit: 'bbl/hr', min: 0, max: 2, decimals: 2 },
      bbl('kettle_loss_bbl', 'Kettle loss (cold)'),
      bbl('fermenter_loss_bbl', 'Fermenter loss'),
    ],
  },
  {
    title: 'Additions',
    testId: 'additions',
    fields: [
      { key: 'whirlfloc_tablets_per_bbl', label: 'Whirlfloc', unit: 'tablets/bbl', min: 0, max: 20, decimals: 2 },
      { key: 'clarity_ferm_ml_per_plato_bbl', label: 'Clarity Ferm', unit: 'mL/°P/bbl', min: 0, max: 20, decimals: 4 },
      { key: 'zinc_g_per_bbl', label: 'Zinc (kettle volume)', unit: 'g per 8 bbl', min: 0, max: 5, decimals: 2, scale: 8 },
    ],
  },
  {
    title: 'Yeast',
    testId: 'yeast',
    fields: [{ key: 'pitch_rate', label: 'Pitch rate', unit: 'M cells/mL/°P', min: 0.1, max: 5, decimals: 2 }],
  },
  {
    title: 'Source water',
    testId: 'water',
    fields: [
      ppm('water_ca_ppm', 'Calcium (Ca)'),
      ppm('water_mg_ppm', 'Magnesium (Mg)'),
      ppm('water_na_ppm', 'Sodium (Na)'),
      ppm('water_co3_ppm', 'Carbonate (CO₃)'),
      ppm('water_hco3_ppm', 'Bicarbonate (HCO₃)'),
      ppm('water_so4_ppm', 'Sulfate (SO₄)'),
      ppm('water_cl_ppm', 'Chloride (Cl)'),
    ],
  },
]

export const SETTING_FIELDS = SETTING_GROUPS.flatMap((g) => g.fields)

/** Places the API keeps of a stored scaled value (zinc's 0.09375). */
const SCALED_DECIMALS = 5

/** A field as its box holds it: "202", "0.75" (zinc, per 8 bbl), "rc_2026". */
export function fieldText(f: SettingField, s: BrewerySettings): string {
  const stored = String(s[f.key] ?? '')
  return !isEquation(f) && f.scale ? roundString(Number(stored) * f.scale, SCALED_DECIMALS) : stored
}

/** A field as the page shows it: "202 °F", "RC 2026", "0.75 g per 8 bbl". */
export function fieldShown(f: SettingField, text: string): string {
  if (isEquation(f)) return IBU_EQUATIONS.find((e) => e.value === text)?.label ?? text
  return f.unit ? `${text} ${f.unit}` : text
}

/** "Zinc (kettle volume) must be between 0 and 40 g per 8 bbl": limits in the screen's unit. */
export function limitsText(f: NumberField): string {
  const n = (v: number) => (v * (f.scale ?? 1)).toLocaleString('en-US')
  return `${f.label} must be between ${n(f.min)} and ${n(f.max)}${f.unit ? ` ${f.unit}` : ''}`
}

export type ParsedField = { ok: true; stored: string } | { ok: false; error: string }

/** What a box holds as the stored value, or the sentence refusing it. */
export function parseField(f: NumberField, text: string): ParsedField {
  const limits = limitsText(f)
  const parsed = parseDecimal(text, f.decimals)
  if (!parsed.ok) return { ok: false, error: `${limits}. ${parsed.error}.` }
  if (parsed.value === null) return { ok: false, error: `${limits}.` }
  const stored = f.scale ? roundString(Number(parsed.value) / f.scale, SCALED_DECIMALS) : parsed.value
  if (Number(stored) < f.min || Number(stored) > f.max) return { ok: false, error: `${limits}.` }
  return { ok: true, stored }
}

export type Draft = Record<string, string>

export const draftOf = (s: BrewerySettings): Draft => Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, fieldText(f, s)]))

export interface DraftResult {
  /** Only the fields that differ from `base`: an untouched box is never sent (nor checked). */
  changes: Record<string, string>
  errors: Record<string, string>
}

export function readDraft(draft: Draft, base: BrewerySettings): DraftResult {
  const changes: Record<string, string> = {}
  const errors: Record<string, string> = {}
  for (const f of SETTING_FIELDS) {
    const text = draft[f.key]
    if (text.trim() === fieldText(f, base)) continue
    if (isEquation(f)) {
      changes[f.key] = text
      continue
    }
    const parsed = parseField(f, text)
    if (!parsed.ok) errors[f.key] = parsed.error
    else if (Number(parsed.stored) !== Number(base[f.key])) changes[f.key] = parsed.stored
  }
  return { changes, errors }
}

/**
 * Someone saved first (409): what was typed stays, every other box takes the
 * current value. `now` says the current value beside a typed box whose value
 * they changed too.
 */
export function mergeDraft(draft: Draft, opened: BrewerySettings, current: BrewerySettings): { draft: Draft; now: Record<string, string> } {
  const merged: Draft = {}
  const now: Record<string, string> = {}
  for (const f of SETTING_FIELDS) {
    const was = fieldText(f, opened)
    const is = fieldText(f, current)
    const typed = draft[f.key].trim() !== was
    merged[f.key] = typed ? draft[f.key] : is
    if (typed && is !== was && draft[f.key].trim() !== is) now[f.key] = fieldShown(f, is)
  }
  return { draft: merged, now }
}

/** "Last changed by Morgan Mash on Nov 25, 2026" (Colorado), or null before anyone has. */
export function lastChanged(s: BrewerySettings): string | null {
  if (!s.updated_by) return null
  const [y, m, d] = localDayKey(s.updated_at).split('-').map(Number)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)))
  return `Last changed by ${s.updated_by.name} on ${day}`
}

/** Why a save was refused. The API's field sentences name the setting, so no field key in front. */
export function settingsError(err: unknown): string {
  const errors = (err as { response?: { status?: number; data?: { errors?: unknown } } } | null)?.response
  if (errors?.status === 422 && errors.data?.errors && typeof errors.data.errors === 'object') {
    const text = Object.values(errors.data.errors).flat().filter((m) => typeof m === 'string')
    if (text.length) return text.join('; ')
  }
  return parseApiError(err)
}
