// D60 §3.5, §3.7, §3.9: the grain units on the UI side. Feature values are
// stored in one unit each (extract % FGDB, color °L, diastatic power
// °Lintner); the convert popup works out the stored value from another unit
// and the API keeps what was typed as `entered_value`/`entered_unit`.
// Quantities are stored in the product's unit (lb for grain); packs (a
// grain sack) are worked out with a lot's or offer's pack size (D62 §3.5).
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

/** The message for a comma that isn't a thousands separator ("5,2"). */
export const COMMA_DECIMAL = 'Use . for the decimal point'
/** The message for a number below 0 ("-1"). */
export const NEGATIVE = 'Enter 0 or more'

/**
 * What a number box holds: digits with at most one `.` as the decimal point
 * (Matt, 2026-11-18, local QA gap 3: `.` is the only decimal point). Commas
 * are taken only as thousands separators in groups of three (`1,234` is 1234,
 * `12,345.5` is 12345.5); any other comma (`5,2`, `1,23`, `1,2345`) is refused
 * with "Use . for the decimal point". A minus sign is refused with "Enter 0 or
 * more", anything else (letters, `1e3`) with its own message. Empty is
 * `null`. The value is a plain string ("1234.5").
 *
 * With `decimals` (D61 carry-over 4), more decimal places than that are
 * refused with "Use at most N decimals" instead of being rounded on save;
 * trailing zeros don't count (`1.550` is 1.55).
 */
export function parseDecimal(text: string, decimals?: number): ParsedDecimal {
  const t = text.trim()
  if (t === '') return { ok: true, value: null }
  if (/^-\s*[\d.,]*\d[\d.,]*$/.test(t)) return { ok: false, error: NEGATIVE }
  const grouped = /^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)
  if (!grouped && t.includes(',') && /^[\d.,]+$/.test(t)) return { ok: false, error: COMMA_DECIMAL }
  const value = grouped ? t.replace(/,/g, '') : t
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(value)) return { ok: false, error: 'Use digits and one . for the decimal point' }
  const places = (value.split('.')[1] ?? '').replace(/0+$/, '').length
  if (decimals != null && places > decimals) return { ok: false, error: tooManyDecimals(decimals) }
  return { ok: true, value: value.startsWith('.') ? `0${value}` : value.endsWith('.') ? value.slice(0, -1) : value }
}

/** The message for more decimal places than a box takes. */
export const tooManyDecimals = (decimals: number) =>
  decimals === 0 ? 'Use a whole number' : `Use at most ${decimals} ${decimals === 1 ? 'decimal' : 'decimals'}`

/** Decimal places the API keeps for quantities and pack sizes, and for $ (prices). */
export const LB_DECIMALS = 2
export const PRICE_DECIMALS = 2

// ── Quantities (D60 §3.7, §3.9; D62 §3.5: packs and the product's unit) ──

/** `packs`: packs + the loose part in the unit ("12 sacks 22.5 lb"); `lb`: the total in the unit (stored as "lb"). */
export type QuantityDisplay = 'packs' | 'lb'

/** An offer's or lot's pack: its name ("sack") and size in the product's unit (55). */
export interface Pack {
  name: string | null
  size: number
}

const toNumber = (v: string | number | null | undefined) => (v == null || v === '' ? null : Number(v))

/** Decimal places a quantity in `unit` takes: `each` is whole numbers (D62 §3.5). */
export const unitDecimals = (unit: string | null | undefined) => (unit === 'each' ? 0 : LB_DECIMALS)

/** A pack name's plural: sack/sacks, box/boxes, bag/bags, …, each/each. */
export function packPlural(name: string | null | undefined): string {
  if (!name) return 'packs'
  if (name === 'each') return 'each'
  if (name === 'box') return 'boxes'
  return `${name}s`
}

/** "sack" for 1, else the plural. */
export const packWord = (name: string | null | undefined, n: number) => (n === 1 ? (name ?? 'pack') : packPlural(name))

/** "Sacks" (a label). */
export const packLabel = (name: string | null | undefined) => {
  const plural = packPlural(name)
  return plural.charAt(0).toUpperCase() + plural.slice(1)
}

/** "Sack size (lb)": a pack size box's label. */
export const packSizeLabel = (name: string | null | undefined, unit: string = 'lb') => {
  const n = name ?? 'pack'
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} size (${unit})`
}

/** The smallest quantity the API takes, said in the unit. */
export const minQuantity = (unit: string = 'lb') => `Enter at least ${unit === 'each' ? '1' : '0.01'} ${unit}`

/**
 * A quantity's boxes (packs and the loose part, or the total alone when
 * `packSize` is null) as a quantity in the unit: null when empty or refused,
 * `valid` false while refused. Over 0 but under 0.01 (the API's smallest) is
 * refused with `error`, before rounding makes it 0 (lead decisions 3, gap 16).
 */
export function readQuantity(
  packText: string,
  looseText: string,
  packSize: number | null,
  unit: string = 'lb',
): { quantity: string | null; valid: boolean; error?: string } {
  const decimals = unitDecimals(unit)
  const pp = parseDecimal(packSize != null ? packText : '', LB_DECIMALS)
  const pl = parseDecimal(looseText, decimals)
  if (!pp.ok || !pl.ok) return { quantity: null, valid: false }
  if (pp.value == null && pl.value == null) return { quantity: null, valid: true }
  const packs = Number(pp.value ?? 0)
  const loose = Number(pl.value ?? 0)
  const raw = packSize != null ? packs * packSize + loose : loose
  if (raw > 0 && raw < 0.01) return { quantity: null, valid: false, error: minQuantity(unit) }
  return { quantity: String(packSize != null ? packsToQuantity(packs, loose, packSize, unit) : loose), valid: true }
}

/** Packs and the loose part as a quantity, rounded to 0.01 (to 1 for `each`). */
export function packsToQuantity(packs: number, loose: number, packSize: number, unit: string = 'lb'): number {
  const scale = 10 ** unitDecimals(unit)
  return Math.round((packs * packSize + loose) * scale) / scale
}

/** A quantity as whole packs and the loose part left over (0.01 precision; 1 for `each`). */
export function quantityToPacks(quantity: number, packSize: number, unit: string = 'lb'): { packs: number; loose: number } {
  const scale = 10 ** unitDecimals(unit)
  const units = Math.round(quantity * scale)
  const packUnits = Math.round(packSize * scale)
  const packs = Math.floor(units / packUnits)
  return { packs, loose: (units - packs * packUnits) / scale }
}

const fmtAmount = (n: number, unit: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: unitDecimals(unit) })} ${unit}`

/**
 * A quantity as the account shows it (D60 §3.9, D62 §3.5; the API's
 * `Units.format_quantity/5`): "12 sacks 22.5 lb", "12 sacks" (whole packs),
 * "22.5 lb" (under one pack), or the total, "682.5 lb". Without a pack size
 * it's always the total. `each` is whole numbers. A negative quantity (a
 * movement out) gets a "−".
 */
export function formatQuantity(
  quantity: string | number | null | undefined,
  packName: string | null | undefined,
  packSize: string | number | null | undefined,
  unit: string | null | undefined,
  mode: QuantityDisplay,
): string {
  const n = toNumber(quantity)
  if (n == null || Number.isNaN(n)) return '—'
  const u = unit || 'lb'
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(n)
  const size = toNumber(packSize)
  if (mode === 'lb' || !size || size <= 0) return `${sign}${fmtAmount(abs, u)}`
  const { packs, loose } = quantityToPacks(abs, size, u)
  if (packs === 0) return `${sign}${fmtAmount(loose, u)}`
  const packPart = `${packs.toLocaleString('en-US')} ${packWord(packName, packs)}`
  return loose === 0 ? `${sign}${packPart}` : `${sign}${packPart} ${fmtAmount(loose, u)}`
}

/** A lot's pack (null without a size). */
export function lotPack(lot: { pack_name: string | null; pack_size: string | number | null } | null | undefined): Pack | null {
  const size = toNumber(lot?.pack_size)
  return lot && size && size > 0 ? { name: lot.pack_name, size } : null
}

/**
 * The pack to show a product's total in: the one its stocked lots share (or,
 * with no stocked lots, its active offers share). Lots or offers of
 * different packs: none, and the total shows in the unit.
 */
export function productPack(
  offers: { pack_name: string | null; pack_size: string | number | null; active?: boolean }[] | null | undefined,
  lots?: { pack_name: string | null; pack_size: string | number | null; on_hand?: string | number | null }[] | null,
): Pack | null {
  const stocked = (lots ?? []).filter((l) => (toNumber(l.on_hand) ?? 0) > 0)
  const packs = stocked.length ? stocked : (offers ?? []).filter((o) => o.active !== false)
  const unique = new Map(packs.map((p) => [`${p.pack_name}|${toNumber(p.pack_size)}`, p]))
  if (unique.size !== 1) return null
  const [only] = unique.values()
  return lotPack(only)
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
  return r.quantity_display === 'packs' || r.quantity_display === 'lb' ? { quantity_display: r.quantity_display } : {}
}

/** The display to use: the stored one, or packs + unit. */
export const quantityDisplay = (stored: unknown): QuantityDisplay => cleanIngredientSettings(stored).quantity_display ?? 'packs'
