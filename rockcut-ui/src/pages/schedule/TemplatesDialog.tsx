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
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { addDaysKey, formatDayColumn, localDayKey, localInputToUtc, utcToLocalInput } from '../../lib/datetime'
import type { ScheduleTemplate, Shift } from '../../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  templates: ScheduleTemplate[]
  weekShifts: Shift[]
  mondayKey: string
  days: string[]
  canManageShift: (s: Shift) => boolean
  onNotice: (msg: string) => void
}

function readError(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } }
  return e?.response?.data?.error || parseApiError(err)
}

// A shift → a template item (weekday index + wall-clock times).
function shiftToItem(s: Shift) {
  const sLocal = utcToLocalInput(s.starts_at)
  const eLocal = utcToLocalInput(s.ends_at)
  const dow = new Date(`${sLocal.slice(0, 10)}T12:00:00Z`).getUTCDay()
  return {
    position_id: s.position_id,
    assignee_id: s.assignee_id,
    day_index: (dow + 6) % 7,
    start_time: `${sLocal.slice(11, 16)}:00`,
    end_time: `${eLocal.slice(11, 16)}:00`,
    notes: s.notes,
  }
}

export default function TemplatesDialog({ open, onClose, templates, weekShifts, mondayKey, days, canManageShift, onNotice }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [saveKind, setSaveKind] = useState<'week' | 'day'>('week')
  const [saveDay, setSaveDay] = useState(days[0] ?? '')
  const [applyDate, setApplyDate] = useState(mondayKey)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const manageable = weekShifts.filter(canManageShift)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(readError(err))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      if (!name.trim()) {
        setError('Name is required')
        return
      }
      const source = saveKind === 'week' ? manageable : manageable.filter((s) => localDayKey(s.starts_at) === saveDay)
      const items = source.map((s) => (saveKind === 'week' ? shiftToItem(s) : { ...shiftToItem(s), day_index: 0 }))
      await api.post('/api/schedule_templates', { name: name.trim(), kind: saveKind, items })
      qc.invalidateQueries({ queryKey: ['schedule_templates'] })
      setName('')
      onNotice(`Saved "${name.trim()}" (${items.length} shift${items.length === 1 ? '' : 's'})`)
    })

  const apply = (t: ScheduleTemplate) =>
    run(async () => {
      let created = 0
      let skipped = 0
      for (const item of t.items) {
        const date = t.kind === 'week' ? addDaysKey(mondayKey, item.day_index) : applyDate
        const endDate = item.end_time <= item.start_time ? addDaysKey(date, 1) : date
        try {
          await api.post('/api/shifts', {
            position_id: item.position_id,
            assignee_id: item.assignee_id,
            starts_at: localInputToUtc(`${date}T${item.start_time.slice(0, 5)}`),
            ends_at: localInputToUtc(`${endDate}T${item.end_time.slice(0, 5)}`),
            notes: item.notes,
          })
          created++
        } catch {
          skipped++
        }
      }
      qc.invalidateQueries({ queryKey: ['shifts'] })
      onNotice(`Applied "${t.name}": created ${created}${skipped ? `, skipped ${skipped}` : ''}`)
    })

  const remove = (t: ScheduleTemplate) =>
    run(async () => {
      await api.delete(`/api/schedule_templates/${t.id}`)
      qc.invalidateQueries({ queryKey: ['schedule_templates'] })
    })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Schedule templates</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Typography variant="overline">Save current schedule as a template</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField size="small" label="Template name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField select size="small" label="Scope" value={saveKind} onChange={(e) => setSaveKind(e.target.value as 'week' | 'day')} sx={{ minWidth: 110 }}>
            <MenuItem value="week">Week</MenuItem>
            <MenuItem value="day">Day</MenuItem>
          </TextField>
          {saveKind === 'day' && (
            <TextField select size="small" label="Day" value={saveDay} onChange={(e) => setSaveDay(e.target.value)} sx={{ minWidth: 110 }}>
              {days.map((d) => (
                <MenuItem key={d} value={d}>{formatDayColumn(d)}</MenuItem>
              ))}
            </TextField>
          )}
          <Button variant="contained" onClick={save} disabled={busy}>Save</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Captures the {manageable.length} shift{manageable.length === 1 ? '' : 's'} you manage in this view.
        </Typography>

        <Divider />

        <Typography variant="overline">Apply a template</Typography>
        <TextField
          size="small"
          type="date"
          label="Apply day templates on"
          value={applyDate}
          onChange={(e) => setApplyDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ maxWidth: 220 }}
        />
        {templates.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No templates yet.</Typography>
        ) : (
          <List dense>
            {templates.map((t) => (
              <ListItem
                key={t.id}
                secondaryAction={
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Button size="small" variant="outlined" disabled={busy} onClick={() => apply(t)}>Apply</Button>
                    <IconButton edge="end" size="small" disabled={busy} onClick={() => remove(t)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                }
              >
                <ListItemText primary={t.name} secondary={`${t.items.length} shift${t.items.length === 1 ? '' : 's'}`} />
                <Box sx={{ mr: 14 }}>
                  <Chip label={t.kind} size="small" />
                </Box>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  )
}
