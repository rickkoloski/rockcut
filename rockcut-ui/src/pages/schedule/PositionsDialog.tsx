import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
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
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import type { Department, Position, ShiftTemplate } from '../../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  positions: Position[]
  departments: Department[]
  shiftTemplates: ShiftTemplate[]
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

export default function PositionsDialog({ open, onClose, positions, departments, shiftTemplates }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState<number | ''>('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [presetName, setPresetName] = useState('')
  const [presetStart, setPresetStart] = useState('09:00')
  const [presetEnd, setPresetEnd] = useState('17:00')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const deptId = departmentId || departments[0]?.id || ''

  const run = async (fn: () => Promise<unknown>, keys: unknown[][]) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const addPosition = async () => {
    const dept = departments.find((d) => d.id === deptId)
    if (!name.trim() || !dept) return
    await run(async () => {
      await api.post('/api/positions', { name: name.trim(), department_id: dept.id, group: dept.name })
      setName('')
    }, [['positions']])
  }

  const addPreset = (positionId: number) =>
    run(async () => {
      if (!presetName.trim()) return
      await api.post('/api/shift_templates', {
        position_id: positionId,
        name: presetName.trim(),
        start_time: `${presetStart}:00`,
        end_time: `${presetEnd}:00`,
      })
      setPresetName('')
    }, [['shift_templates']])

  const templatesFor = (posId: number) => shiftTemplates.filter((t) => t.position_id === posId)

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
          <TextField select label="Department" size="small" value={deptId} onChange={(e) => setDepartmentId(Number(e.target.value))} sx={{ minWidth: 140 }}>
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={addPosition} disabled={busy}>Add</Button>
        </Stack>

        <List dense>
          {grouped.map(([label, list]) => (
            <Box key={label}>
              <ListSubheader disableSticky>{label}</ListSubheader>
              {list.map((p) => (
                <Box key={p.id}>
                  <ListItem
                    secondaryAction={
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Tooltip title="Standard hours">
                          <IconButton size="small" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                            {expanded === p.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Button size="small" disabled={busy} onClick={() => run(() => api.patch(`/api/positions/${p.id}`, { active: !p.active }), [['positions']])}>
                          {p.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Tooltip title="Delete (or deactivate if in use)">
                          <IconButton edge="end" size="small" disabled={busy} onClick={() => run(() => api.delete(`/api/positions/${p.id}`), [['positions']])}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                  >
                    <ListItemText primary={p.name} secondary={p.active ? undefined : 'inactive'} />
                    {!p.active && <Chip label="inactive" size="small" sx={{ ml: 1 }} />}
                  </ListItem>

                  <Collapse in={expanded === p.id} unmountOnExit>
                    <Box sx={{ pl: 2, pb: 1 }}>
                      <Typography variant="caption" color="text.secondary">Standard hours</Typography>
                      {templatesFor(p.id).length === 0 && (
                        <Typography variant="body2" color="text.secondary">None yet.</Typography>
                      )}
                      {templatesFor(p.id).map((t) => (
                        <Stack key={t.id} direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" sx={{ flexGrow: 1 }}>
                            {t.name} · {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}
                          </Typography>
                          <IconButton size="small" disabled={busy} onClick={() => run(() => api.delete(`/api/shift_templates/${t.id}`), [['shift_templates']])}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }} alignItems={{ sm: 'center' }}>
                        <TextField size="small" label="Name" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                        <TextField size="small" label="Start" type="time" value={presetStart} onChange={(e) => setPresetStart(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
                        <TextField size="small" label="End" type="time" value={presetEnd} onChange={(e) => setPresetEnd(e.target.value)} slotProps={{ htmlInput: { step: 900 }, inputLabel: { shrink: true } }} />
                        <Button size="small" variant="outlined" disabled={busy} onClick={() => addPreset(p.id)}>Add</Button>
                      </Stack>
                    </Box>
                  </Collapse>
                </Box>
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
