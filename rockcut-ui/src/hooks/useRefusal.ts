import { useState } from 'react'

/**
 * A dialog's refusal from its last save, cleared as soon as any of `inputs`
 * changes (D48 DEV QA N5, R2): a corrected input never sits under the old
 * message. `inputs` are the dialog's fields, compared by value.
 */
export function useRefusal(inputs: unknown[]) {
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(inputs)
  const [seen, setSeen] = useState(key)
  // Adjusted while rendering, not in an effect: the stale message never paints.
  if (seen !== key) {
    setSeen(key)
    if (error !== null) setError(null)
  }
  return [error, setError] as const
}
