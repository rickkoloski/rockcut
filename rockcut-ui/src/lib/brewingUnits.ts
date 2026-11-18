// D60 §3.5, §3.7, §3.9: the grain units on the UI side. Feature values are
// stored in one unit each (extract % FGDB, color °L, diastatic power
// °Lintner); the convert popup works out the stored value from another unit
// and the API keeps what was typed as `entered_value`/`entered_unit`.
// Quantities are stored in lb; sacks are worked out with a lot's sack size.
// The API's side of this is `RockcutApi.Ingredients.Units` (the same 46.214).

/** Gravity points of one pound of pure sucrose in one gallon. */
export const PPG_OF_SUCROSE = 46.214

export type EnteredUnit = 'fgdb' | 'as_is' | 'ppg' | 'lovibond' | 'srm' | 'ebc' | 'lintner' | 'wk'

/** The units each convertible feature can be entered in; the first is the stored one. */
export const FEATURE_UNITS: Record<string, EnteredUnit[]> = {
  extract_fgdb: ['fgdb', 'as_is', 'ppg'],
  color_lovibond: ['lovibond', 'srm', 'ebc'],
  diastatic_power_lintner: ['lintner', 'wk'],
}

export const UNIT_LABELS: Record<EnteredUnit, string> = {
  fgdb: '% FGDB',
  as_is: '% as-is',
  ppg: 'PPG',
  lovibond: '°L',
  srm: 'SRM',
  ebc: 'EBC',
  lintner: '°Lintner',
  wk: '°WK',
}

export type Converted = { ok: true; value: number } | { ok: false; error: string }

/** As-is extract → % FGDB: as-is ÷ (1 − moisture ÷ 100). Needs the moisture, under 100. */
export function asIsToFgdb(asIs: number, moisture: number | null | undefined): Converted {
  if (moisture == null || Number.isNaN(moisture)) return { ok: false, error: 'Enter the moisture first: as-is extract needs it' }
  if (moisture < 0 || moisture >= 100) return { ok: false, error: 'Moisture must be at least 0 and under 100' }
  return { ok: true, value: asIs / (1 - moisture / 100) }
}

/** PPG (dry basis) → % FGDB: PPG ÷ 46.214 × 100. */
export const ppgToFgdb = (ppg: number) => (ppg / PPG_OF_SUCROSE) * 100

/** SRM → °L: (SRM + 0.76) ÷ 1.3546. */
export const srmToLovibond = (srm: number) => (srm + 0.76) / 1.3546

/** EBC → °L: (EBC ÷ 1.97 + 0.76) ÷ 1.3546. */
export const ebcToLovibond = (ebc: number) => (ebc / 1.97 + 0.76) / 1.3546

/** °WK → °Lintner: (°WK + 16) ÷ 3.5. */
export const wkToLintner = (wk: number) => (wk + 16) / 3.5

/** A value typed in `unit` as its feature's stored value (as-is extract needs `moisture`). */
export function toStored(unit: EnteredUnit, value: number, moisture?: number | null): Converted {
  switch (unit) {
    case 'as_is':
      return asIsToFgdb(value, moisture)
    case 'ppg':
      return { ok: true, value: ppgToFgdb(value) }
    case 'srm':
      return { ok: true, value: srmToLovibond(value) }
    case 'ebc':
      return { ok: true, value: ebcToLovibond(value) }
    case 'wk':
      return { ok: true, value: wkToLintner(value) }
    default:
      return { ok: true, value }
  }
}

/** `n` rounded to `decimals` places, as a string without trailing zeros (as the API stores it). */
export function roundString(n: number, decimals: number): string {
  return String(Number(n.toFixed(decimals)))
}

// ── Decimal input (4982) ──

export type ParsedDecimal = { ok: true; value: string | null } | { ok: false; error: string }

/**
 * What a number box holds: digits with at most one `,` or `.` as the decimal
 * point. Empty is `null`. Anything else (a minus sign, letters, thousands
 * separators) is refused with a message. The value is a string with a `.`.
 */
export function parseDecimal(text: string): ParsedDecimal {
  const t = text.trim()
  if (t === '') return { ok: true, value: null }
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return { ok: false, error: 'Use digits and one , or . for the decimal point' }
  const value = t.replace(',', '.')
  return { ok: true, value: value.startsWith('.') ? `0${value}` : value.endsWith('.') ? value.slice(0, -1) : value }
}

// ── Quantities (§3.7, §3.9) ──

export type QuantityDisplay = 'sacks' | 'lb'

const toNumber = (v: string | number | null | undefined) => (v == null || v === '' ? null : Number(v))

/** Sacks and loose lb as lb, rounded to 0.01 lb. */
export function sacksToLb(sacks: number, lb: number, sackSize: number): number {
  return Math.round((sacks * sackSize + lb) * 100) / 100
}

/** lb as whole sacks and the loose lb left over (0.01 lb precision). */
export function lbToSacks(lb: number, sackSize: number): { sacks: number; lb: number } {
  const cents = Math.round(lb * 100)
  const sackCents = Math.round(sackSize * 100)
  const sacks = Math.floor(cents / sackCents)
  return { sacks, lb: (cents - sacks * sackCents) / 100 }
}

const fmtLb = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/**
 * A quantity as the account shows it (§3.9): "12 sacks 22.5 lb", "12 sacks"
 * (whole sacks), "22.5 lb" (under one sack), or "682.5 lb". Without a sack
 * size it's always lb. A negative quantity (a movement out) gets a "−".
 */
export function formatQuantity(lb: string | number | null | undefined, sackSize: string | number | null | undefined, mode: QuantityDisplay): string {
  const n = toNumber(lb)
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(n)
  const size = toNumber(sackSize)
  if (mode === 'lb' || !size || size <= 0) return `${sign}${fmtLb(abs)} lb`
  const { sacks, lb: loose } = lbToSacks(abs, size)
  if (sacks === 0) return `${sign}${fmtLb(loose)} lb`
  const sackPart = `${sacks.toLocaleString('en-US')} ${sacks === 1 ? 'sack' : 'sacks'}`
  return loose === 0 ? `${sign}${sackPart}` : `${sign}${sackPart} ${fmtLb(loose)} lb`
}

/**
 * The sack size to show a product's total in: the one size its stocked lots
 * share (or, with no stocked lots, its active offers share). Lots or offers
 * of different sizes: none, and the total shows in lb.
 */
export function productSackSize(
  offers: { sack_size_lb: string | number | null; active?: boolean }[] | null | undefined,
  lots?: { sack_size_lb: string | number | null; on_hand_lb?: string | number | null }[] | null,
): number | null {
  const stocked = (lots ?? []).filter((l) => (toNumber(l.on_hand_lb) ?? 0) > 0)
  const sizes = stocked.length
    ? stocked.map((l) => toNumber(l.sack_size_lb))
    : (offers ?? []).filter((o) => o.active !== false).map((o) => toNumber(o.sack_size_lb))
  const unique = new Set(sizes)
  if (unique.size !== 1) return null
  const [size] = unique
  return size && size > 0 ? size : null
}

// ── Feature values ──

/** A feature value with its type's decimals ("2.80", "81.0"); blank as "—". */
export function formatFeature(value: string | number | null | undefined, decimals: number): string {
  const n = toNumber(value)
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(decimals)
}

/** "entered as 3.0 SRM": what was typed, when a conversion was used. */
export function enteredAs(entry: { entered_value: string | number | null; entered_unit: string | null } | null | undefined): string | null {
  if (!entry?.entered_unit || entry.entered_value == null) return null
  const label = UNIT_LABELS[entry.entered_unit as EnteredUnit] ?? entry.entered_unit
  // The API drops trailing zeros: a whole number shows one decimal ("3.0 SRM").
  const typed = String(entry.entered_value)
  return `entered as ${/^-?\d+$/.test(typed) ? `${typed}.0` : typed} ${label}`
}

// ── The account's display setting (§3.9) ──

/** The board-settings key (`PUT /api/me/board_settings/ingredients`). */
export const INGREDIENTS_BOARD = 'ingredients'

export interface IngredientSettings {
  quantity_display: QuantityDisplay
}

/** The ingredients settings in `raw` that are valid; anything else is dropped. */
export function cleanIngredientSettings(raw: unknown): Partial<IngredientSettings> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return r.quantity_display === 'sacks' || r.quantity_display === 'lb' ? { quantity_display: r.quantity_display } : {}
}

/** The display to use: the stored one, or sacks + lb. */
export const quantityDisplay = (stored: unknown): QuantityDisplay => cleanIngredientSettings(stored).quantity_display ?? 'sacks'
