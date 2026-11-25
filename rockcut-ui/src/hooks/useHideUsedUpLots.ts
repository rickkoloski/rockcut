import { useState } from 'react'
import useAuth from './useAuth'
import { INGREDIENTS_BOARD, hideUsedUpLots } from '../lib/brewingUnits'

/**
 * D63 §4.4 (A8, A9): whether a hop's use lists leave out used-up lots, per
 * person on the account (`board_settings.ingredients.hide_used_up_lots`), as
 * the packs/total toggle. A failed save keeps the choice for this page and
 * says so.
 */
export function useHideUsedUpLots(): { hide: boolean; setHide: (hide: boolean) => void; notSaved: boolean } {
  const stored = useAuth((s) => s.boardSettings[INGREDIENTS_BOARD])
  const save = useAuth((s) => s.saveBoardSettings)
  const [notSaved, setNotSaved] = useState(false)
  return {
    hide: hideUsedUpLots(stored),
    setHide: (hide) => {
      setNotSaved(false)
      save(INGREDIENTS_BOARD, { hide_used_up_lots: hide }).catch(() => setNotSaved(true))
    },
    notSaved,
  }
}
