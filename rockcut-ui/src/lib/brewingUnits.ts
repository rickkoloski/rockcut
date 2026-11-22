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

/**
 * The labels an `each` product's count reads in, plural → singular: "tablets"
 * on a Tablet (D65 §4.3); D64 §4.1 "bricks" on a Dry yeast and "pitchables"
 * on a Liquid one.
 */
export const COUNT_WORDS: Record<string, string> = { tablets: 'tablet', bricks: 'brick', pitchables: 'pitchable' }

/** D65 Stop 3 (Stop 2 LEAD note 7): a unit after "$/" is singular: "$0.1055/tablet", "$76.99/brick", "$1.54/lb". */
export const perUnitLabel = (unit: string | null | undefined) => (unit && COUNT_WORDS[unit]) || (unit ?? 'lb')

/** Whole-number units: `each` (D62 §3.5) and its labels, "tablets" (D65 §4.3), "bricks" and "pitchables" (D64). */
export const isCountUnit = (unit: string | null | undefined) => unit === 'each' || (!!unit && unit in COUNT_WORDS)

/** Decimal places a quantity in `unit` takes: `each` (or "tablets") is whole numbers (D62 §3.5). */
export const unitDecimals = (unit: string | null | undefined) => (isCountUnit(unit) ? 0 : LB_DECIMALS)

/** A pack name's plural: sack/sacks, box/boxes, bag/bags, …, each/each. */
export function packPlural(name: string | null | undefined): string {
  if (!name) return 'packs'
  if (name === 'each') return 'each'
  if (name === 'box') return 'boxes'
  return `${name}s`
}

/**
 * D65 lead decisions 2 (gap 8): a pack and its size in the unit, as a label
 * says it: "55 lb sacks", and a count "tubs of 872 tablets" (never "872 tablets tubs").
 */
export const packSizeText = (name: string | null | undefined, size: number | string, unit: string = 'lb') =>
  // D64: a pack of one that is the unit itself (a brick of 1 brick) reads just "bricks".
  isCountUnit(unit) && Number(size) === 1 && packPlural(name) === unit
    ? unit
    : isCountUnit(unit)
      ? `${packPlural(name)} of ${Number(size)} ${unitWord(unit, Number(size))}`
      : `${Number(size)} ${unit} ${packPlural(name)}`

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

/**
 * D65 lead decisions 1 (gaps 5, 7): the API's words for a count that isn't
 * whole: "Whirlfloc T is counted in whole tablets", "… whole numbers" for
 * another `each`.
 */
export const wholeCountMessage = (productName: string | null | undefined, unit: string | null | undefined) =>
  `${productName || 'This product'} is counted in whole ${unit && unit in COUNT_WORDS ? unit : 'numbers'}`

/**
 * The product as the API names it in a refusal (`Products.short_name/1`):
 * the ingredient and the product name, else the ingredient and the form.
 */
export const productShortName = (
  p: { name?: string | null; form?: string | null; ingredient?: { name: string } | null; category_key?: string | null } | null | undefined,
) =>
  // D64 §4.1: a yeast product goes by its code ("US-05 is counted in whole bricks").
  (p?.category_key === 'yeast' && p?.name) || [p?.ingredient?.name, p?.name || p?.form].filter(Boolean).join(' ') || null

/** The smallest quantity the API takes, said in the unit. */
export const minQuantity = (unit: string = 'lb') =>
  // D65 (Stop 1 LEAD note 10): a count starts at 1, "1 tablet", plain "1" for each.
  unit in COUNT_WORDS ? `Enter at least 1 ${COUNT_WORDS[unit]}` : unit === 'each' ? 'Enter at least 1' : `Enter at least 0.01 ${unit}`

/**
 * A quantity's boxes (packs and the loose part, or the total alone when
 * `packSize` is null) as a quantity in the unit: null when empty or refused,
 * `valid` false while refused. Over 0 but under 0.01 (the API's smallest) is
 * refused with `error`, before rounding makes it 0 (lead decisions 3, gap 16).
 *
 * D65 lead decisions 1 (gaps 5, 7): a count (`each`, "tablets") is never
 * rounded. When the packs and the loose part don't come to a whole number
 * (0.5 tub of 333 is 166.5) it's refused with `error` ("<product> is counted
 * in whole tablets"), and nothing is sent.
 *
 * D65 lead decisions 2 (gap 16): with `positive` (a dialog where 0 isn't
 * allowed), a count of 0 is refused as it's typed with the smallest the API
 * takes ("Enter at least 1 tablet"); a minus says the same under its box
 * (`QuantityInput`'s `negativeText`). Decimal units, and counts where 0 is
 * allowed (Count), keep "Enter 0 or more" for a minus.
 */
export function readQuantity(
  packText: string,
  looseText: string,
  packSize: number | null,
  unit: string = 'lb',
  productName?: string | null,
  positive = false,
): { quantity: string | null; valid: boolean; error?: string } {
  const count = isCountUnit(unit)
  const pp = parseDecimal(packSize != null ? packText : '', LB_DECIMALS)
  // A count's loose box takes decimals here so the refusal is the whole-count one, not "Use a whole number".
  const pl = parseDecimal(looseText, count ? LB_DECIMALS : unitDecimals(unit))
  if (!pp.ok || !pl.ok) return { quantity: null, valid: false }
  if (pp.value == null && pl.value == null) return { quantity: null, valid: true }
  const packs = Number(pp.value ?? 0)
  const loose = Number(pl.value ?? 0)
  const raw = packSize != null ? packs * packSize + loose : loose
  if (positive && count && raw === 0) return { quantity: null, valid: false, error: minQuantity(unit) }
  if (raw > 0 && raw < 0.01) return { quantity: null, valid: false, error: minQuantity(unit) }
  // Whole to within float noise (0.1 × 30 is 3.0000000000000004), never by rounding a real fraction.
  if (count && Math.abs(raw - Math.round(raw)) > 1e-9) return { quantity: null, valid: false, error: wholeCountMessage(productName, unit) }
  return { quantity: String(packSize != null ? packsToQuantity(packs, loose, packSize, unit) : loose), valid: true }
}

/** Packs and the loose part as a quantity, to 0.01 (`each`: only called with whole results, never rounded to 1). */
export function packsToQuantity(packs: number, loose: number, packSize: number, unit: string = 'lb'): number {
  const scale = 10 ** (isCountUnit(unit) ? LB_DECIMALS : unitDecimals(unit))
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

/** D65 lead decisions 1 (gap 6): a unit word for `n`: "1 tablet", else as given ("2 tablets", "1 lb"). */
export const unitWord = (unit: string, n: number) => (n === 1 && COUNT_WORDS[unit]) || unit

const fmtAmount = (n: number, unit: string) => `${n.toLocaleString('en-US', { maximumFractionDigits: unitDecimals(unit) })} ${unitWord(unit, n)}`

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
/**
 * D65: features that show fewer places than they keep: extract keeps 2
 * (81.95) but reads as it did with 1 ("81.5", "91.0").
 */
const MIN_SHOWN: Record<string, number> = { extract_fgdb: 1 }

/**
 * D65: the places a conversion rounds to: what the feature shows (extract
 * 1, as D60 stored "37.0 PPG" as 80.1), else its decimals. A typed value
 * still keeps the type's decimals (81.95).
 */
export const convertDecimals = (type: { key: string; decimals: number }) => MIN_SHOWN[type.key] ?? type.decimals

/**
 * D65 lead decisions 1 (gap 4): features that always show all their places,
 * ranges and reopened boxes included ("14.0 °Bx", "6.5–9.0"). Others' ranges
 * read as typed on the supplier's sheet ("11–13").
 */
const PADDED_KEYS = new Set(['brix'])

/** A stored value as a box shows it when a dialog reopens: Brix padded to its places ("14.0"), others as stored. */
export function boxText(value: string | number | null | undefined, type: { key: string; decimals: number }): string {
  if (value == null || value === '') return ''
  const n = Number(value)
  return PADDED_KEYS.has(type.key) && !Number.isNaN(n) ? n.toFixed(type.decimals) : String(value)
}

/** True when a range of `type` shows all its places (Brix). */
export const paddedRange = (type: number | { key: string; decimals: number }) => typeof type !== 'number' && PADDED_KEYS.has(type.key)

/** A feature value to the type's decimals ("2.00"); given the type, extract trims to 1–2 ("81.5", "81.95"). */
export function formatFeature(value: string | number | null | undefined, type: number | { key: string; decimals: number }): string {
  const n = toNumber(value)
  if (n == null || Number.isNaN(n)) return '—'
  const decimals = typeof type === 'number' ? type : type.decimals
  const min = typeof type === 'number' ? decimals : (MIN_SHOWN[type.key] ?? decimals)
  let text = n.toFixed(decimals)
  while (min < decimals && text.includes('.') && text.endsWith('0') && text.split('.')[1].length > min) text = text.slice(0, -1)
  return text
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
