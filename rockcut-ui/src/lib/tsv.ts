// D61 §3.6 (decision 36): the totals tables copy as tab-separated text that
// pastes into a spreadsheet as columns: plain numbers (no $, units or
// thousands separators, `.` decimal), dates as YYYY-MM-DD, nothing for blank.

export type Cell = string | number | boolean | null | undefined

/** One cell as plain text: numbers as typed digits, text without tabs or line breaks. */
export function tsvCell(v: Cell): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'yes' : ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return v.replace(/[\t\r\n]+/g, ' ').trim()
}

/** A header row and rows (total rows included, in place) as TSV, one line each. */
export function toTsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(tsvCell).join('\t')).join('\n')
}
