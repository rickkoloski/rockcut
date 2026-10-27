import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemButton, ListItemText, Radio, TextField, Tooltip, Typography } from '@mui/material'
import { DeleteOutline } from '@mui/icons-material'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import api from '../../../lib/api'
import { dayLabel } from '../../../lib/gantt'
import { MARK_STATES, markLabel, OUTAGE_GROUPS, prodPath, type ConditionMark, type MarkState, type Outage, type Tank, type TankStatusLine } from '../../../lib/production'
import { useFlows } from './flowsContext'

interface Props {
  tank: Tank
  /** D48: its status line (whether it's empty, clean or dirty) and its clean / dirty marks. */
  status?: TankStatusLine
  marks: ConditionMark[]
  today: string
  onOpen: (o: Outage | null) => void
  onClose: () => void
}

const markText = (m: ConditionMark) => `Marked ${markLabel(m.state).toLowerCase()} by ${m.user_name ?? 'someone'} · ${dayLabel(m.marked_on)}${m.note ? ` · “${m.note}”` : ''}`

/**
 * D47 §3.6 a tank's ⋯ panel: its out-of-service periods (Now / Coming up /
 * Past), each opening its dialog, and Mark out of service. D48 §3.8: the
 * marks under History with Remove. D49 §3.12a (mockup B): "Mark the tank
 * as" Clean & sanitized / Clean not sanitized / Dirty, a list of large rows
 * (the current state's greyed out), with the day and a note under it and
 * Save mark at the bottom; hidden while beer is in the tank.
 */
export default function TankPanel({ tank, status, marks, today, onOpen, onClose }: Props) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const [marking, setMarking] = useState<MarkState | null>(null)
  const [day, setDay] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = status?.state
  // What the tank is now, as a mark (none while it's out of service).
  const current: MarkState | null = state === 'sani' || state === 'clean' ? 'clean' : state === 'cleaned' ? 'cleaned' : state === 'dirty' ? 'dirty' : null
  const canMark = !!state && state !== 'in_use'
  const history = [...marks].sort((a, b) => b.marked_on.localeCompare(a.marked_on) || b.id - a.id)

  const remove = async (m: ConditionMark) => {
    const r = await flows.write(() => api.delete(prodPath('condition_marks', m.id)), `Mark removed: ${tank.name} ${m.state} ${dayLabel(m.marked_on)}.`)
    setError(r.ok ? null : r.error)
  }

  const save = async () => {
    if (!marking) return setError('Pick how the tank is.')
    if (!day) return setError('Pick the day.')
    if (day > today) return setError('Pick today or an earlier day.')
    setBusy(true)
    const r = await flows.write(
      () => api.post(prodPath('tanks', tank.id, 'condition'), { state: marking, marked_on: day, note: note.trim() || null }),
      `${tank.name} marked ${markLabel(marking).toLowerCase()} (${dayLabel(day)}).`,
    )
    setBusy(false)
    if (r.ok) {
      setMarking(null)
      setNote('')
      setError(null)
    } else setError(r.error)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth data-testid="tank-panel">
      <DialogTitle>
        {tank.name}
        <Typography variant="body2" color="text.secondary">
          {tank.capacity_bbl} bbl{status?.line ? ` · ${status.line}` : ''}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {error && (
          <Typography variant="body2" color="error" role="alert" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}
        {!tank.outages.length && (
          <Typography variant="body2" color="text.secondary">
            No out-of-service periods.
          </Typography>
        )}
        {OUTAGE_GROUPS.map(({ state: group, label }) => {
          const list = tank.outages.filter((o) => o.state === group)
          if (!list.length) return null
          return (
            <Box key={group} data-testid={`tank-panel-${group}`}>
              <Typography variant="caption" color={group === 'now' ? 'error.main' : 'text.secondary'} sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                {label}
              </Typography>
              <List dense disablePadding>
                {list.map((o) => (
                  <ListItemButton key={o.id} onClick={() => onOpen(o)} data-testid={`tank-panel-outage-${o.id}`}>
                    <ListItemText primary={o.label} secondary={o.reason} />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          )
        })}
        {canMark && (
          <Box sx={{ mt: 1 }} data-testid="tank-panel-mark-list">
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
              Mark the tank as
            </Typography>
            <List disablePadding role="radiogroup" aria-label="Mark the tank as">
              {MARK_STATES.map((m) => {
                const isCurrent = m.key === current
                return (
                  <ListItemButton
                    key={m.key}
                    role="radio"
                    aria-checked={marking === m.key}
                    disabled={isCurrent}
                    selected={marking === m.key}
                    onClick={() => setMarking(m.key)}
                    sx={{ minHeight: 56, borderRadius: 1, px: 1 }}
                    data-testid={`tank-panel-mark-as-${m.key}`}
                  >
                    <Radio checked={marking === m.key} tabIndex={-1} disableRipple size="small" sx={{ p: 0.5, mr: 1 }} />
                    <ListItemText
                      primary={m.label}
                      secondary={isCurrent ? 'Current state' : m.hint}
                      slotProps={{ primary: { sx: { color: isCurrent ? 'text.disabled' : m.color, fontWeight: 600 } } }}
                    />
                  </ListItemButton>
                )
              })}
            </List>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
              <TextField
                type="date"
                label="Day"
                size="small"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, 'data-testid': 'mark-day' } }}
              />
              <TextField label="Note (optional)" size="small" value={note} onChange={(e) => setNote(e.target.value)} multiline slotProps={{ htmlInput: { maxLength: 500, 'data-testid': 'mark-note' } }} />
            </Box>
          </Box>
        )}
        {history.length > 0 && (
          <Box sx={{ mt: 1 }} data-testid="tank-panel-history">
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
              History
            </Typography>
            <List dense disablePadding>
              {history.map((m) => (
                <ListItem
                  key={m.id}
                  disableGutters
                  data-testid={`tank-panel-mark-${m.id}`}
                  secondaryAction={
                    <Tooltip title="Remove">
                      <IconButton edge="end" size="small" aria-label={`Remove: ${markText(m)}`} onClick={() => remove(m)} data-testid={`tank-panel-mark-remove-${m.id}`}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemText primary={`${markLabel(m.state)} · ${dayLabel(m.marked_on)}`} secondary={[m.user_name, m.note && `“${m.note}”`].filter(Boolean).join(' · ')} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Button onClick={() => onOpen(null)} color="error" data-testid="tank-panel-mark-out">
          Mark out of service…
        </Button>
        {canMark && (
          <Button variant="contained" onClick={save} disabled={!marking || busy} data-testid="tank-panel-mark-save">
            Save mark
          </Button>
        )}
        <Button onClick={onClose} sx={{ ml: 'auto' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
