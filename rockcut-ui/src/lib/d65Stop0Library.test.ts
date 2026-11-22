// D65 Stop 0 (D62 lead decisions 5, gap 4): the Ingredient Library's Category in the URL.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { categoryFromParam, categoryParam, libraryHref, rememberLibrarySearch } from './libraryView'

describe('gap 4: ?category=', () => {
  it('reads an id, "all", or nothing (the Grains default); an unknown id is the default once categories are known', () => {
    expect(categoryFromParam('3', null)).toBe(3)
    expect(categoryFromParam('3', [1, 3])).toBe(3)
    expect(categoryFromParam('all', [1, 3])).toBe('')
    expect(categoryFromParam(null, [1, 3])).toBeNull()
    expect(categoryFromParam('999', [1, 3])).toBeNull()
    expect(categoryFromParam('hops', [1, 3])).toBeNull()
  })

  it('writes an id or "all"', () => {
    expect(categoryParam(3)).toBe('3')
    expect(categoryParam('')).toBe('all')
  })
})

describe('gap 4: the links back to the library', () => {
  // Vitest runs in node: a stand-in session storage.
  beforeEach(() => {
    const items = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => items.set(k, v) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('go to the view last shown, else the default', () => {
    expect(libraryHref()).toBe('/ingredients')
    rememberLibrarySearch('?category=3')
    expect(libraryHref()).toBe('/ingredients?category=3')
    rememberLibrarySearch('?category=all')
    expect(libraryHref()).toBe('/ingredients?category=all')
    rememberLibrarySearch('')
    expect(libraryHref()).toBe('/ingredients')
    rememberLibrarySearch('?evil=1')
    expect(libraryHref()).toBe('/ingredients')
  })

  it('go to the default view when storage throws (a private window)', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    rememberLibrarySearch('?category=3')
    expect(libraryHref()).toBe('/ingredients')
  })
})
