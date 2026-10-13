// Pure list-move logic for the shared drag layer (D38). No React, no
// Brewery code: the board, the Daily items dialog and the tests all use it.

/** One sortable list: its id and its item ids in order. */
export interface ListContainer {
  id: string
  itemIds: string[]
}

/**
 * A finished drag: `itemId` goes from `fromContainer` to `toContainer`,
 * just before `beforeId` (null = the end of the list). This is what the
 * server needs.
 */
export interface Move {
  itemId: string
  fromContainer: string
  toContainer: string
  beforeId: string | null
}

/** The id of the container holding `itemId`, or null. */
export function containerOf(containers: ListContainer[], itemId: string): string | null {
  return containers.find((c) => c.itemIds.includes(itemId))?.id ?? null
}

/**
 * The id the server needs to put an item at `index` of `container` (its list
 * without the moving item): the item now at that index, or null at (or past)
 * the end.
 */
export function beforeIdAt(container: ListContainer, index: number): string | null {
  return container.itemIds[Math.max(index, 0)] ?? null
}

/**
 * Apply `move` and return new containers. Returns `containers` itself when
 * the move is a no-op or can't apply (unknown item or container, a locked
 * item, or `beforeId` missing from the target), so callers can compare by
 * identity.
 */
export function applyMove(
  containers: ListContainer[],
  move: Move,
  isLocked: (itemId: string) => boolean = () => false,
): ListContainer[] {
  const { itemId, fromContainer, toContainer, beforeId } = move
  const from = containers.find((c) => c.id === fromContainer)
  const to = containers.find((c) => c.id === toContainer)
  if (!from || !to || !from.itemIds.includes(itemId) || isLocked(itemId)) return containers
  if (beforeId === itemId) return containers

  const targetIds = to.itemIds.filter((id) => id !== itemId)
  const index = beforeId === null ? targetIds.length : targetIds.indexOf(beforeId)
  if (index < 0) return containers

  const nextTarget = [...targetIds.slice(0, index), itemId, ...targetIds.slice(index)]
  if (from === to && sameIds(nextTarget, from.itemIds)) return containers

  return containers.map((c) => {
    if (c === to) return { ...c, itemIds: nextTarget }
    if (c === from) return { ...c, itemIds: c.itemIds.filter((id) => id !== itemId) }
    return c
  })
}

/**
 * The move that turns `before` into `after` for `itemId`, or null when the
 * item ended where it started.
 */
export function moveBetween(before: ListContainer[], after: ListContainer[], itemId: string): Move | null {
  const fromContainer = containerOf(before, itemId)
  const toContainer = containerOf(after, itemId)
  if (!fromContainer || !toContainer) return null

  const oldIds = before.find((c) => c.id === fromContainer)!.itemIds
  const newIds = after.find((c) => c.id === toContainer)!.itemIds
  if (fromContainer === toContainer && oldIds.indexOf(itemId) === newIds.indexOf(itemId)) return null

  return { itemId, fromContainer, toContainer, beforeId: newIds[newIds.indexOf(itemId) + 1] ?? null }
}

/** Put `itemId` at `index` of `toContainer` (used while a drag is in flight). */
export function placeAt(containers: ListContainer[], itemId: string, toContainer: string, index: number): ListContainer[] {
  const fromContainer = containerOf(containers, itemId)
  const to = containers.find((c) => c.id === toContainer)
  if (!fromContainer || !to) return containers
  const target = { ...to, itemIds: to.itemIds.filter((id) => id !== itemId) }
  return applyMove(containers, { itemId, fromContainer, toContainer, beforeId: beforeIdAt(target, index) })
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * Whether an item that started in `from` may land in `to`: its own list
 * always; another list when there's no rule, or the rule allows it.
 */
export function canLand(from: string, to: string, canMoveTo?: (fromList: string, toList: string) => boolean): boolean {
  return to === from || !canMoveTo || canMoveTo(from, to)
}
