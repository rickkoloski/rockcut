// D64 Stop 2: brinks on the screens: what's in one, its count, the empty
// weight beside every lb field, and the lb a person types.
import { parseDecimal } from './brewingUnits'
import { BOARD_QUERY_KEY } from './tasks'
import type { YeastBrink, YeastContents } from './types'

/** What a brink write refreshes: the brinks, a brink's History, and the board (its Count / Clean tasks). */
export const BRINK_KEYS: unknown[][] = [['yeast_brinks'], ['yeast_brink_history'], [BOARD_QUERY_KEY]]

/** "11/20" from "2026-11-20". */
export const shortDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

/** "42 lb", "42.5 lb". */
export const lbText = (v: string | number | null | undefined) => `${Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} lb`

/** "US-05", or "Co-ferment: US-05 + WLP002" (spec §5.3). */
export const strainsText = (y: Pick<YeastContents, 'strains' | 'coferment'>) => (y.coferment ? `Co-ferment: ${y.strains.join(' + ')}` : y.strains.join(' + '))

/** "US-05 gen 2", "Co-ferment: US-05 + WLP002 · gen 1". */
export const yeastText = (y: Pick<YeastContents, 'strains' | 'coferment' | 'generation'>) => `${strainsText(y)}${y.coferment ? ' · ' : ' '}gen ${y.generation}`

/** Decision 8: "YB2 empty: 148 lb", shown beside every lb field; null without an empty weight. */
export const emptyWeightText = (b: Pick<YeastBrink, 'name' | 'empty_weight_lb'>) => (b.empty_weight_lb != null ? `${b.name} empty: ${lbText(b.empty_weight_lb)}` : null)

/**
 * The count in effect as the tab says it: "1,200 M/mL · 92% · counted 11/18",
 * "… · before the 11/20 harvest", "Not counted".
 */
export function countText(y: Pick<YeastContents, 'count'>): string {
  const c = y.count
  if (!c) return 'Not counted'
  const cells = Number(c.viable_millions_per_ml).toLocaleString('en-US', { maximumFractionDigits: 1 })
  const pct = Number(c.viability_pct).toLocaleString('en-US', { maximumFractionDigits: 1 })
  return [`${cells} M/mL · ${pct}%`, `counted ${shortDate(c.counted_on)}`, c.before_harvest_on ? `before the ${shortDate(c.before_harvest_on)} harvest` : null].filter(Boolean).join(' · ')
}

/** The brink's one-line state: "YB1 · empty", "YB3 · empty · dirty since 11/20", "YB2 · 42 lb US-05 gen 2". */
export function brinkStateText(b: Pick<YeastBrink, 'name' | 'dirty' | 'dirty_since' | 'yeast'>): string {
  if (!b.yeast) return [b.name, 'empty', b.dirty ? `dirty since ${shortDate(b.dirty_since)}` : null].filter(Boolean).join(' · ')
  return `${b.name} · ${lbText(b.yeast.on_hand_lb)} ${yeastText(b.yeast)}`
}

/** "From #41 (gen 2) and #44 (gen 3)" (spec §4.5). */
export function sourcesText(y: Pick<YeastContents, 'sources' | 'coferment'>): string {
  const parts = y.sources.map((s) => `${s.batch ?? 'a batch'} (${y.coferment ? `${s.strains.join(' + ')} ` : ''}gen ${s.generation ?? '?'})`)
  const uniq = [...new Set(parts)]
  if (uniq.length === 0) return ''
  return `From ${uniq.length === 1 ? uniq[0] : `${uniq.slice(0, -1).join(', ')} and ${uniq[uniq.length - 1]}`}`
}

/**
 * A lb box: `{lb}` (a decimal string, 2 places at most) or `{error}`. With
 * `zeroOk` (Adjust weight) 0 is allowed; with `max` (Pitch: on hand) more is
 * refused as the API says it ("YB2 has 18 lb").
 */
export function readLb(text: string, opts: { zeroOk?: boolean; max?: number; brink?: string } = {}): { lb: string | null; error: string | null } {
  const p = parseDecimal(text, 2)
  if (!p.ok) return { lb: null, error: p.error }
  if (p.value == null) return { lb: null, error: null }
  const n = Number(p.value)
  if (n < 0 || (!opts.zeroOk && n === 0)) return { lb: null, error: opts.zeroOk ? 'Enter 0 or more' : 'Enter more than 0 lb' }
  if (n > 10000) return { lb: null, error: 'At most 10,000 lb' }
  if (opts.max != null && n > opts.max) return { lb: null, error: `${opts.brink ?? 'The brink'} has ${lbText(opts.max)}` }
  return { lb: p.value, error: null }
}
