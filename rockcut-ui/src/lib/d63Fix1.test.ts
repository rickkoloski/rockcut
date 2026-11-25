import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { dropWhenLeft } from './dropWhenLeft'
import { packNoteHelper } from './purchasing'

// D63 fix cycle 1 (local QA gaps 3 and 4).

describe('dropWhenLeft', () => {
  const key = ['ingredient_product', 1]
  const setup = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, gcTime: Infinity } } })
    qc.setQueryData(key, { id: 1 })
    qc.setQueryData(['ingredient_product', 2], { id: 2 })
    return qc
  }
  const page = (qc: QueryClient, queryKey = key) => new QueryObserver(qc, { queryKey, queryFn: () => ({ id: 1 }) }).subscribe(() => {})

  it('drops the row at once when no page shows it, and no other row', () => {
    const qc = setup()
    dropWhenLeft(qc, key)
    expect(qc.getQueryData(key)).toBeUndefined()
    expect(qc.getQueryData(['ingredient_product', 2])).toEqual({ id: 2 })
  })

  it('waits until the last page showing it is left', () => {
    const qc = setup()
    const [one, two] = [page(qc), page(qc)]
    dropWhenLeft(qc, key)
    expect(qc.getQueryData(key)).toEqual({ id: 1 })
    one()
    expect(qc.getQueryData(key)).toEqual({ id: 1 })
    two()
    expect(qc.getQueryData(key)).toBeUndefined()
  })

  it('stops watching: the row read again later is kept', () => {
    const qc = setup()
    const leave = page(qc)
    dropWhenLeft(qc, key)
    expect(qc.getQueryCache().hasListeners()).toBe(true)
    leave()
    expect(qc.getQueryCache().hasListeners()).toBe(false)
    qc.setQueryData(key, { id: 1 })
    page(qc)()
    expect(qc.getQueryData(key)).toEqual({ id: 1 })
  })

  it('a row under a longer key (the estimates) stays', () => {
    const qc = setup()
    qc.setQueryData([...key, 'estimates'], {})
    dropWhenLeft(qc, key)
    expect(qc.getQueryData([...key, 'estimates'])).toEqual({})
  })
})

describe('the pack note hint', () => {
  const offer = (pack_name: string, pack_size: string | null, unit: string, pack_note = '') => packNoteHelper({ pack_name, pack_size, pack_note }, unit)

  it('tablets and other counts give the "(5 lb)" example', () => {
    expect(offer('tub', '872', 'tablets')).toBe('Optional, shown with the pack: "tub · 872 tablets (5 lb)"')
    expect(offer('tub', null, 'tablets')).toBe('Optional, shown with the pack: "tub · … tablets (5 lb)"')
    expect(offer('tub', '100', 'each')).toBe('Optional, shown with the pack: "tub · 100 each (5 lb)"')
  })

  it('a brick gives its weight; a pitchable and a case of bricks give none', () => {
    expect(offer('brick', '1', 'bricks')).toBe('Optional, shown with the pack: "brick · 1 (500 g)"')
    for (const [pack, unit] of [['case', 'bricks'], ['pitchable', 'pitchables']] as const) expect(offer(pack, '1', unit)).toBe('Optional, shown with the pack')
  })

  it('weights and volumes give no example', () => {
    for (const unit of ['g', 'mL', 'lb', 'oz', 'gal', 'fl oz']) {
      expect(offer('bag', '250', unit)).toBe('Optional, shown with the pack')
      expect(offer('bag', null, unit)).toBe('Optional, shown with the pack')
    }
  })

  it('a typed note shows as it will read, in any unit', () => {
    expect(offer('bag', '250', 'g', ' half full ')).toBe('Optional, shown with the pack: "bag · 250 g (half full)"')
    expect(offer('jug', null, 'mL', '10 L')).toBe('Optional, shown with the pack: "jug · … mL (10 L)"')
  })
})
