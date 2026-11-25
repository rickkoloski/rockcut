import type { QueryClient } from '@tanstack/react-query'

/**
 * D63 (local QA gap 3): forget a deleted row's cached detail query, so phone or
 * browser Back to its page asks the API again and says "not found" instead of
 * drawing the cached row. Only once nothing shows it: while its page is still
 * up (the delete goes on to another page), removing the query would blank it.
 */
export function dropWhenLeft(qc: QueryClient, queryKey: unknown[]) {
  const cache = qc.getQueryCache()
  const query = cache.find({ queryKey, exact: true })
  if (!query) return
  const drop = () => {
    if (query.getObserversCount() > 0) return false
    cache.remove(query)
    return true
  }
  if (drop()) return
  const stop = cache.subscribe((event) => {
    if (event.query !== query) return
    // `removed`: something else dropped it first (sign-out clears the cache).
    if (event.type === 'removed' || (event.type === 'observerRemoved' && drop())) stop()
  })
}
