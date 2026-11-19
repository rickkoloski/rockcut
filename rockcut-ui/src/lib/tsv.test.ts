import { describe, expect, it } from 'vitest'
import { toTsv, tsvCell } from './tsv'

describe('TSV for Copy (decision 36)', () => {
  it('plain cells: numbers as they are, blanks empty, text without tabs or breaks', () => {
    expect(tsvCell(1512)).toBe('1512')
    expect(tsvCell('1512.00')).toBe('1512.00')
    expect(tsvCell(0.7636)).toBe('0.7636')
    expect(tsvCell(null)).toBe('')
    expect(tsvCell(undefined)).toBe('')
    expect(tsvCell(Number.NaN)).toBe('')
    expect(tsvCell('a\tb\nc')).toBe('a b c')
    expect(tsvCell(true)).toBe('yes')
    expect(tsvCell(false)).toBe('')
    expect(tsvCell('2026-11-18')).toBe('2026-11-18')
  })

  it('header, rows and total rows, tab-separated, one line each', () => {
    const text = toTsv(
      ['Grain', 'lb', 'Value'],
      [
        ['2-Row', '220', '220.00'],
        ['Pilsner', 55, null],
        ['Total', 275, '220.00'],
      ],
    )
    expect(text).toBe('Grain\tlb\tValue\n2-Row\t220\t220.00\nPilsner\t55\t\nTotal\t275\t220.00')
    expect(text.split('\n').map((l) => l.split('\t').length)).toEqual([3, 3, 3, 3])
  })
})
