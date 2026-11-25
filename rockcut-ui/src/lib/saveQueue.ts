// D63 §4.4: a list's reorders, saved one at a time in the order they were made
// (a second drag before the first save answers loses neither). Each save sends
// the version the one before it answered with. After a failure the saves still
// waiting fail with it: they were moves of an order that isn't there.

export interface SaveQueue<L> {
  /** Save `ids`; `version` is the list's as shown, used when nothing is waiting. */
  push: (ids: number[], version: string) => Promise<L>
}

export function saveQueue<L extends { version: string }>(
  save: (ids: number[], version: string) => Promise<L>,
  /** Every save is in, or one failed; called after the pushers have heard. */
  onIdle: (failed: boolean) => void,
): SaveQueue<L> {
  let tail: Promise<unknown> = Promise.resolve()
  let waiting = 0
  let busy = false
  let version = ''
  let failure: { error: unknown } | null = null

  const finish = () => {
    if (waiting > 0 || !busy) return
    const failed = failure !== null
    busy = false
    failure = null
    onIdle(failed)
  }

  return {
    push: (ids, shown) => {
      if (!busy) {
        busy = true
        version = shown
      }
      waiting += 1
      const run = tail.then(async () => {
        if (failure) throw failure.error
        try {
          const list = await save(ids, version)
          version = list.version
          return list
        } catch (error) {
          failure = { error }
          throw error
        }
      })
      tail = run
        .catch(() => {})
        .then(() => {
          waiting -= 1
          setTimeout(finish, 0)
        })
      return run
    },
  }
}
