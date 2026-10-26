import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemButton, ListItemText, TextField, Tooltip, Typography } from '@mui/material'
import { DeleteOutline } from '@mui/icons-material'
import FormDialog from '../../../components/FormDialog'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import api from '../../../lib/api'
import { dayLabel } from '../../../lib/gantt'
import { OUTAGE_GROUPS, prodPath, type ConditionMark, type Outage, type Tank, type TankStatusLine } from '../../../lib/production'
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

const markText = (m: ConditionMark) => `Marked ${m.state} by ${m.user_name ?? 'someone'} · ${dayLabel(m.marked_on)}${m.note ? ` · “${m.note}”` : ''}`

/**
 * D47 §3.6 a tank's ⋯ panel: its out-of-service periods (Now / Coming up /
 * Past), each opening its dialog, and Mark out of service. D48 §3.8: Mark
 * clean… when it's empty and dirty, Mark dirty… when it's empty and clean
 * (neither while beer is in it), and the marks under History with Remove.
 */
export default function TankPanel({ tank, status, marks, today, onOpen, onClose }: Props) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const [marking, setMarking] = useState<'clean' | 'dirty' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const state = status?.state
  const history = [...marks].sort((a, b) => b.marked_on.localeCompare(a.marked_on) || b.id - a.id)

  const remove = async (m: ConditionMark) => {
    const r = await flows.write(() => api.delete(prodPath('condition_marks', m.id)), `Mark removed: ${tank.name} ${m.state} ${dayLabel(m.marked_on)}.`)
    setError(r.ok ? null : r.error)
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
                  <ListItemText primary={`${m.state === 'clean' ? 'Clean' : 'Dirty'} · ${dayLabel(m.marked_on)}`} secondary={[m.user_name, m.note && `“${m.note}”`].filter(Boolean).join(' · ')} />
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
        {(state === 'dirty' || state === 'out') && (
          <Button onClick={() => setMarking('clean')} data-testid="tank-panel-mark-clean">
            Mark clean…
          </Button>
        )}
        {(state === 'sani' || state === 'clean' || state === 'out') && (
          <Button onClick={() => setMarking('dirty')} data-testid="tank-panel-mark-dirty">
            Mark dirty…
          </Button>
        )}
        <Button onClick={onClose} sx={{ ml: 'auto' }}>
          Close
        </Button>
      </DialogActions>
      {marking && <MarkDialog tank={tank} state={marking} today={today} onClose={() => setMarking(null)} />}
    </Dialog>
  )
}

/** Mark clean… / Mark dirty… (§3.8, P114–P115): the day (today or earlier) and an optional note. */
function MarkDialog({ tank, state, today, onClose }: { tank: Tank; state: 'clean' | 'dirty'; today: string; onClose: () => void }) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const [day, setDay] = useState(today)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!day) return setError('Pick the day.')
    if (day > today) return setError('Pick today or an earlier day.')
    setBusy(true)
    const r = await flows.write(
      () => api.post(prodPath('tanks', tank.id, 'condition'), { state, marked_on: day, note: note.trim() || null }),
      `${tank.name} marked ${state} (${dayLabel(day)}).`,
    )
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  return (
    <FormDialog open onClose={onClose} title={`Mark ${tank.name} ${state}`} onSubmit={save} loading={busy} error={error} testId="mark-dialog" cancelLabel="Cancel">
      <Typography variant="body2" color="text.secondary">
        {state === 'clean'
          ? 'Records that the tank was cleaned without a CIP & Sanitize on the schedule. No task is added.'
          : 'Records that the empty tank needs cleaning: it shows dirty until a CIP & Sanitize.'}
      </Typography>
      <TextField
        type="date"
        label="Day"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, 'data-testid': 'mark-day' } }}
      />
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline slotProps={{ htmlInput: { maxLength: 500, 'data-testid': 'mark-note' } }} />
    </FormDialog>
  )
}
