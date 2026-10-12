import { useCallback, useState } from 'react'
import { applyMove, type ListContainer, type Move } from './moveModel'

/**
 * Optimistic moves over server-owned lists (D38).
 *
 * `source` is what the server last said. `move(m, persist)` shows the move at
 * once and runs `persist()`. If it rejects, the lists go back to how they were
 * before the move and the error is rethrown (the caller shows the toast).
 * New `source` data (a refetch) replaces any optimistic state, so keep
 * `source` stable between refetches (`useMemo` over the query data).
 */
export function useOptimisticLists(source: ListContainer[], isLocked?: (itemId: string) => boolean) {
  const [seen, setSeen] = useState(source)
  const [optimistic, setOptimistic] = useState<ListContainer[] | null>(null)

  // A refetch wins over the optimistic lists (reset during render, not in an effect).
  if (seen !== source) {
    setSeen(source)
    setOptimistic(null)
  }

  const containers = seen === source ? (optimistic ?? source) : source

  const move = useCallback(
    async (m: Move, persist: () => Promise<unknown>) => {
      const next = applyMove(containers, m, isLocked)
      if (next === containers) return
      setOptimistic(next)
      try {
        await persist()
      } catch (error) {
        setOptimistic(containers)
        throw error
      }
    },
    [containers, isLocked],
  )

  return { containers, move }
}
