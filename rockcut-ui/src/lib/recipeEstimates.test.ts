import { describe, expect, it } from 'vitest'
import { estimateCalls, formatIbu, formatOg, readEstimates } from './recipeEstimates'

describe('recipe estimates (D60 gap 7)', () => {
  it('asks est_og and est_ibu for each recipe and reads them back by id', () => {
    expect(estimateCalls([20, 21]).map((c) => `${c.function}:${c.args.recipe_id}`)).toEqual(['est_og:20', 'est_ibu:20', 'est_og:21', 'est_ibu:21'])
    expect(
      readEstimates(
        [20, 21],
        [
          { status: 'ok', value: 1.0448 },
          { status: 'ok', value: 23.44 },
          { status: 'error' },
          { status: 'ok', value: 0 },
        ],
      ),
    ).toEqual({ 20: { og: 1.0448, ibu: 23.44 }, 21: { og: null, ibu: 0 } })
  })

  it('formats OG to 3 places and IBU to 1; nothing to show is a dash', () => {
    expect(formatOg(1.0448)).toBe('1.045')
    expect(formatOg(1)).toBe('—')
    expect(formatOg(null)).toBe('—')
    expect(formatIbu(23.44)).toBe('23.4')
    expect(formatIbu(0)).toBe('0')
    expect(formatIbu(undefined)).toBe('—')
  })
})
