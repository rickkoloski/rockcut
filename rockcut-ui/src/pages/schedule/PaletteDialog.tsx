import { useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { departmentColor } from '../../lib/colors'
import type { Department } from '../../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  departments: Department[]
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

export default function PaletteDialog({ open, onClose, departments }: Props) {
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const colorFor = (dep: Department) => drafts[dep.id] ?? departmentColor(dep)

  const commit = async (dep: Department) => {
    const color = drafts[dep.id]
    if (!color || color.toLowerCase() === (dep.color ?? '').toLowerCase()) return
    setError(null)
    setBusy(true)
    try {
      await api.patch(`/api/departments/${dep.id}`, { color })
      qc.invalidateQueries({ queryKey: ['departments'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Department colors</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">
          Each shift is colored by its department, shaded by position.
        </Typography>
        <Stack spacing={1.5}>
          {departments.map((dep) => (
            <Stack key={dep.id} direction="row" spacing={2} alignItems="center">
              <input
                type="color"
                value={colorFor(dep)}
                disabled={busy}
                onChange={(e) => setDrafts((d) => ({ ...d, [dep.id]: e.target.value }))}
                onBlur={() => commit(dep)}
                style={{ width: 48, height: 32, border: 'none', background: 'none', cursor: 'pointer' }}
                aria-label={`${dep.name} color`}
              />
              <Typography>{dep.name}</Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
