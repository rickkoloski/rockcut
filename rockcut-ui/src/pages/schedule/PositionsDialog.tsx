import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import type { Department, Position } from '../../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  positions: Position[]
  departments: Department[]
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

export default function PositionsDialog({ open, onClose, positions, departments }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const deptId = departmentId || departments[0]?.id || ''

  const invalidate = () => qc.invalidateQueries({ queryKey: ['positions'] })

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
      invalidate()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    const dept = departments.find((d) => d.id === deptId)
    if (!name.trim() || !dept) return
    await run(async () => {
      await api.post('/api/positions', { name: name.trim(), department_id: dept.id, group: dept.name })
      setName('')
    })
  }

  const grouped = departments
    .map((d) => [d.name, positions.filter((p) => p.department_id === d.id)] as const)
    .filter(([, list]) => list.length > 0)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage positions</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField label="New position" size="small" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField
            select
            label="Department"
            size="small"
            value={deptId}
            onChange={(e) => setDepartmentId(Number(e.target.value))}
            sx={{ minWidth: 140 }}
          >
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={add} disabled={busy}>Add</Button>
        </Stack>

        <List dense>
          {grouped.map(([label, list]) => (
            <Box key={label}>
              <ListSubheader disableSticky>{label}</ListSubheader>
              {list.map((p) => (
                <ListItem
                  key={p.id}
                  secondaryAction={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() => run(() => api.patch(`/api/positions/${p.id}`, { active: !p.active }))}
                      >
                        {p.active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Tooltip title="Delete (or deactivate if in use)">
                        <IconButton edge="end" size="small" disabled={busy} onClick={() => run(() => api.delete(`/api/positions/${p.id}`))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  }
                >
                  <ListItemText primary={p.name} secondary={p.active ? undefined : 'inactive'} />
                  {!p.active && <Chip label="inactive" size="small" sx={{ ml: 1 }} />}
                </ListItem>
              ))}
            </Box>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
