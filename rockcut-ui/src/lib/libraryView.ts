// D62 lead decisions 5, gap 4: the Ingredient Library keeps its Category in
// the URL (`?category=<id>`, `all` for All categories), so Back and the
// "Ingredients" links on a product or ingredient return to the same view.

const KEY = 'rockcut.ingredients.view'

/** The picked category from `?category=`: null (not picked: Grains), '' (All), or an id; an unknown id is null once the categories are known. */
export function categoryFromParam(value: string | null, ids: number[] | null): number | '' | null {
  if (value === 'all') return ''
  if (value == null || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return ids && !ids.includes(id) ? null : id
}

/** `?category=` for a pick. */
export const categoryParam = (picked: number | ''): string => (picked === '' ? 'all' : String(picked))

/** Remember the library's query string, for the links back to it. */
export function rememberLibrarySearch(search: string) {
  try {
    sessionStorage.setItem(KEY, search)
  } catch {
    // No storage (private window): the links go to the default view.
  }
}

/** The link back to the library as it was last shown: `/ingredients?category=3`, or `/ingredients`. */
export function libraryHref(): string {
  let search = ''
  try {
    search = sessionStorage.getItem(KEY) ?? ''
  } catch {
    // As above.
  }
  return /^\?category=(all|\d+)$/.test(search) ? `/ingredients${search}` : '/ingredients'
}
