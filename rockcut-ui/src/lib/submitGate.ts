/**
 * D60 lead decisions 2 (gap 6): one save at a time. `run(fn)` calls `fn`
 * unless an earlier call is still in flight, in which case it's dropped
 * (returns false) — a double-click on Save on a slow network sent two POSTs,
 * because the dialog's `loading` arrived a render too late to stop the second.
 */
export class SubmitGate {
  private busy = false

  get inFlight() {
    return this.busy
  }

  async run(fn: () => unknown): Promise<boolean> {
    if (this.busy) return false
    this.busy = true
    try {
      await fn()
    } finally {
      this.busy = false
    }
    return true
  }
}
