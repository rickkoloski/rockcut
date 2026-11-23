import { useState } from 'react'
import { Alert } from '@mui/material'
import ConfirmDialog from './ConfirmDialog'
import { useApiDelete } from '../hooks/useApiMutation'
import { GRAIN_KEYS } from '../lib/inventory'
import parseApiError from '../lib/parseApiError'

/**
 * D64 lead decisions 3, gap 5: take back a mistaken pitch of purchased yeast
 * (`can_remove`: its maker or a Brewery manager, no count since). The stock
 * goes back on its lot; a refusal shows here.
 */
export default function RemovePitchDialog({ id, what, onClose }: { id: number; what: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const remove = useApiDelete((mid) => `/api/yeast/pitches/${mid}`, { invalidateKeys: [...GRAIN_KEYS, ['yeast_batch']] })
  return (
    <ConfirmDialog
      open
      title="Remove pitch"
      message={`Remove the pitch of ${what}? It goes back on its lot.`}
      confirmLabel="Remove"
      testId="remove-pitch-confirm"
      onClose={onClose}
      onConfirm={async () => {
        try {
          await remove.mutateAsync(id)
          onClose()
        } catch (err) {
          setError(parseApiError(err))
        }
      }}
    >
      {error && (
        <Alert severity="error" sx={{ mt: 1 }} data-testid="remove-pitch-error">
          {error}
        </Alert>
      )}
    </ConfirmDialog>
  )
}
