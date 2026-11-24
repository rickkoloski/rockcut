import { useState } from 'react'
import { Alert } from '@mui/material'
import ConfirmDialog from './ConfirmDialog'
import { useQueryClient } from '@tanstack/react-query'
import { useApiDelete } from '../hooks/useApiMutation'
import { GRAIN_KEYS } from '../lib/inventory'
import { goneOr } from '../lib/notFound'

const KEYS = [...GRAIN_KEYS, ['yeast_batch']]

/**
 * D64 lead decisions 3, gap 5: take back a mistaken pitch of purchased yeast
 * (`can_remove`: its maker or a Brewery manager, no count since). The stock
 * goes back on its lot; a refusal shows here.
 */
export default function RemovePitchDialog({ id, what, onClose }: { id: number; what: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const remove = useApiDelete((mid) => `/api/yeast/pitches/${mid}`, { invalidateKeys: KEYS })
  const qc = useQueryClient()
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
          await Promise.all(KEYS.map((queryKey) => qc.invalidateQueries({ queryKey })))
          setError(goneOr(err, 'Someone else removed this pitch.'))
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
