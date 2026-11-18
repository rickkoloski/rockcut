import { useState } from 'react'
import useAuth from './useAuth'
import { INGREDIENTS_BOARD, quantityDisplay, type QuantityDisplay } from '../lib/brewingUnits'

/**
 * D60 §3.9: sacks + lb or total lb, per person on the account
 * (`board_settings.ingredients.quantity_display`, as the Gantt's Label by).
 * A failed save keeps the choice for this page and says so.
 */
export function useQuantityDisplay(): {
  mode: QuantityDisplay
  setMode: (mode: QuantityDisplay) => void
  notSaved: boolean
} {
  const stored = useAuth((s) => s.boardSettings[INGREDIENTS_BOARD])
  const save = useAuth((s) => s.saveBoardSettings)
  const [notSaved, setNotSaved] = useState(false)
  return {
    mode: quantityDisplay(stored),
    setMode: (mode) => {
      setNotSaved(false)
      save(INGREDIENTS_BOARD, { quantity_display: mode }).catch(() => setNotSaved(true))
    },
    notSaved,
  }
}
