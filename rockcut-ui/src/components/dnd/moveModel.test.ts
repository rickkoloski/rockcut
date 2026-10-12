import { describe, expect, it } from 'vitest'
import { applyMove, beforeIdAt, containerOf, moveBetween, placeAt, type ListContainer } from './moveModel'

const lists = (): ListContainer[] => [
  { id: 'mon', itemIds: ['a', 'b', 'c'] },
  { id: 'tue', itemIds: ['d', 'e'] },
  { id: 'wed', itemIds: [] },
]

const ids = (containers: ListContainer[]) => Object.fromEntries(containers.map((c) => [c.id, c.itemIds]))

describe('applyMove', () => {
  it('moves within a list', () => {
    const next = applyMove(lists(), { itemId: 'c', fromContainer: 'mon', toContainer: 'mon', beforeId: 'a' })
    expect(ids(next)).toEqual({ mon: ['c', 'a', 'b'], tue: ['d', 'e'], wed: [] })
  })

  it('moves down within a list', () => {
    const next = applyMove(lists(), { itemId: 'a', fromContainer: 'mon', toContainer: 'mon', beforeId: 'c' })
    expect(ids(next).mon).toEqual(['b', 'a', 'c'])
  })

  it('moves across lists', () => {
    const next = applyMove(lists(), { itemId: 'b', fromContainer: 'mon', toContainer: 'tue', beforeId: 'e' })
    expect(ids(next)).toEqual({ mon: ['a', 'c'], tue: ['d', 'b', 'e'], wed: [] })
  })

  it('moves to the end of a list', () => {
    const next = applyMove(lists(), { itemId: 'a', fromContainer: 'mon', toContainer: 'tue', beforeId: null })
    expect(ids(next)).toEqual({ mon: ['b', 'c'], tue: ['d', 'e', 'a'], wed: [] })

    const within = applyMove(lists(), { itemId: 'a', fromContainer: 'mon', toContainer: 'mon', beforeId: null })
    expect(ids(within).mon).toEqual(['b', 'c', 'a'])
  })

  it('moves onto an empty list', () => {
    const next = applyMove(lists(), { itemId: 'd', fromContainer: 'tue', toContainer: 'wed', beforeId: null })
    expect(ids(next)).toEqual({ mon: ['a', 'b', 'c'], tue: ['e'], wed: ['d'] })
  })

  it('leaves a locked item where it is', () => {
    const before = lists()
    const next = applyMove(before, { itemId: 'b', fromContainer: 'mon', toContainer: 'tue', beforeId: null }, (id) => id === 'b')
    expect(next).toBe(before)
  })

  it('can place an item next to a locked one', () => {
    const next = applyMove(lists(), { itemId: 'a', fromContainer: 'mon', toContainer: 'tue', beforeId: 'd' }, (id) => id === 'd')
    expect(ids(next).tue).toEqual(['a', 'd', 'e'])
  })

  it('returns the same lists for a no-op move', () => {
    const before = lists()
    expect(applyMove(before, { itemId: 'b', fromContainer: 'mon', toContainer: 'mon', beforeId: 'c' })).toBe(before)
    expect(applyMove(before, { itemId: 'c', fromContainer: 'mon', toContainer: 'mon', beforeId: null })).toBe(before)
    expect(applyMove(before, { itemId: 'b', fromContainer: 'mon', toContainer: 'mon', beforeId: 'b' })).toBe(before)
  })

  it('returns the same lists when the move does not apply', () => {
    const before = lists()
    expect(applyMove(before, { itemId: 'x', fromContainer: 'mon', toContainer: 'tue', beforeId: null })).toBe(before)
    expect(applyMove(before, { itemId: 'a', fromContainer: 'tue', toContainer: 'mon', beforeId: null })).toBe(before)
    expect(applyMove(before, { itemId: 'a', fromContainer: 'mon', toContainer: 'nope', beforeId: null })).toBe(before)
    expect(applyMove(before, { itemId: 'a', fromContainer: 'mon', toContainer: 'tue', beforeId: 'c' })).toBe(before)
  })

  it('does not change the input', () => {
    const before = lists()
    applyMove(before, { itemId: 'a', fromContainer: 'mon', toContainer: 'tue', beforeId: 'd' })
    expect(ids(before)).toEqual(ids(lists()))
  })
})

describe('beforeIdAt', () => {
  const tue = { id: 'tue', itemIds: ['d', 'e'] }

  it('gives the first item at the start', () => {
    expect(beforeIdAt(tue, 0)).toBe('d')
  })

  it('gives the item at a middle index', () => {
    expect(beforeIdAt(tue, 1)).toBe('e')
  })

  it('gives null at and past the end', () => {
    expect(beforeIdAt(tue, 2)).toBeNull()
    expect(beforeIdAt(tue, 9)).toBeNull()
  })

  it('treats a negative index as the start', () => {
    expect(beforeIdAt(tue, -1)).toBe('d')
  })

  it('gives null for an empty list', () => {
    expect(beforeIdAt({ id: 'wed', itemIds: [] }, 0)).toBeNull()
  })
})

describe('moveBetween and placeAt', () => {
  it('describes a drag as the move the server needs, and applyMove repeats it', () => {
    const before = lists()
    const after = placeAt(before, 'a', 'tue', 1)
    expect(ids(after).tue).toEqual(['d', 'a', 'e'])
    const move = moveBetween(before, after, 'a')
    expect(move).toEqual({ itemId: 'a', fromContainer: 'mon', toContainer: 'tue', beforeId: 'e' })
    expect(ids(applyMove(before, move!))).toEqual(ids(after))
  })

  it('places within a list like an array move', () => {
    expect(ids(placeAt(lists(), 'a', 'mon', 2)).mon).toEqual(['b', 'c', 'a'])
    expect(ids(placeAt(lists(), 'c', 'mon', 0)).mon).toEqual(['c', 'a', 'b'])
  })

  it('gives null when the item ends where it started', () => {
    const before = lists()
    expect(moveBetween(before, before, 'b')).toBeNull()
  })

  it('finds an item’s list', () => {
    expect(containerOf(lists(), 'e')).toBe('tue')
    expect(containerOf(lists(), 'zz')).toBeNull()
  })
})
