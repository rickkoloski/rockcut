import { describe, expect, it } from 'vitest'
import { historyExportPath } from './beerBoard'

describe('historyExportPath (D58 §3.14)', () => {
  it('sends the search, or nothing for everything', () => {
    expect(historyExportPath('')).toBe('/api/beer_board/history/export.csv')
    expect(historyExportPath('Sam Pour')).toBe('/api/beer_board/history/export.csv?q=Sam%20Pour')
    expect(historyExportPath('a&b')).toBe('/api/beer_board/history/export.csv?q=a%26b')
  })
})
