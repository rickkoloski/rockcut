import { useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, TextField, Typography } from '@mui/material'
import { EditNote, NoteAddOutlined } from '@mui/icons-material'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import api from '../../../lib/api'
import { buildParts, dayLabel, daysBetween, dotState, firstBrew } from '../../../lib/gantt'
import { plainBatchNumber, prodPath, vesselLabel, type Flag, type SchedBatch, type SchedStep, type Tank } from '../../../lib/production'
import ErrorAlert from '../ErrorAlert'
import { FlagRow } from './FlagsDialog'
import TankSelect from './TankSelect'
import { dayN } from './scheduleText'
import { useFlows } from './flowsContext'
import DateField from '../DateField'

interface Props {
  batch: SchedBatch
  tanks: Tank[]
  flags: Flag[]
  today: string
  /** Scroll to the flags (opened from a bar's badge). */
  focusFlags?: boolean
  onOpenStep: (step: SchedStep) => void
  onClose: () => void
}

/** A step's name without its addition ("Dry hop - #2" → "Dry hop"): the part that stays. */
const fixedName = (s: SchedStep) => (s.detail && s.name.endsWith(` - ${s.detail}`) ? s.name.slice(0, -(s.detail.length + 3)) : s.name)

/** One step in the batch dialog: date (a change runs the move prompt), the addition to its name, Set temp's temperature, a note button, done or late. */
function StepLine({ step, batch, today, onOpenStep }: { step: SchedStep; batch: SchedBatch; today: string; onOpenStep: (s: SchedStep) => void }) {
  const flows = useFlows()
  const [detail, setDetail] = useState(step.detail ?? '')
  const [temp, setTemp] = useState(step.temperature != null ? String(step.temperature) : '')
  const state = dotState(step, today, buildParts(batch).find((p) => p.stranded.has(step.id)))
  const done = !!step.done_on
  const patch = (body: Record<string, unknown>) => flows.write(() => api.patch(prodPath('steps', step.id), body), 'Saved.')

  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: '150px 56px minmax(0, 1fr) auto' }, gap: 1, alignItems: 'center', py: 0.5 }}
      data-testid={`batch-step-${step.id}`}
    >
      <DateField
        size="small"
        value={step.due_on}
        disabled={done}
        onCommit={(d) => flows.moveSteps([step.id], daysBetween(step.due_on, d))}
        slotProps={{ htmlInput: { 'aria-label': `${step.name} date`, 'data-testid': `batch-step-date-${step.id}` } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
        {dayN(step, batch)}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0, gridColumn: { xs: '1 / -1', sm: 'auto' }, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: step.marker ? 400 : 600, fontStyle: step.marker ? 'italic' : 'normal' }} data-testid={`batch-step-name-${step.id}`}>
          {fixedName(step)}
        </Typography>
        {!step.marker && (
          <TextField
            size="small"
            placeholder="add to name"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            onBlur={() => (detail.trim() || null) !== step.detail && patch({ detail: detail.trim() || null })}
            sx={{ width: 120 }}
            slotProps={{ htmlInput: { maxLength: 40, 'aria-label': `Add to the name of ${step.name}`, 'data-testid': `batch-step-detail-${step.id}` } }}
          />
        )}
        {step.behavior === 'set_temp' && (
          <TextField
            size="small"
            type="number"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            onBlur={() => temp !== '' && Number(temp) !== step.temperature && patch({ temperature: Number(temp) })}
            sx={{ width: 80 }}
            slotProps={{ htmlInput: { min: 28, max: 80, 'aria-label': `${step.name} temperature`, 'data-testid': `batch-step-temp-${step.id}` } }}
          />
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          startIcon={step.notes ? <EditNote /> : <NoteAddOutlined />}
          onClick={() => onOpenStep(step)}
          data-testid={`batch-step-note-${step.id}`}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {step.notes ? 'Note ✎' : '+ Note'}
        </Button>
        {state === 'done' && <Chip size="small" label="✓ done" color="primary" variant="outlined" />}
        {state === 'late' && <Chip size="small" label="late" color="error" variant="outlined" />}
        {state === 'stranded' && <Chip size="small" label="after the tank was emptied" color="error" variant="outlined" data-testid={`batch-step-stranded-${step.id}`} />}
      </Box>
    </Box>
  )
}

/**
 * D47 §3.5 the batch dialog (a bar): number (P-number while planned), a tank
 * per vessel, volume, its flags with sign-off, every step in date order,
 * and Delete planned batch. D48 adds the batch changes.
 */
export default function BatchDialog({ batch, tanks, flags, today, focusFlags, onOpenStep, onClose }: Props) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const planned = batch.status === 'planned'
  const [number, setNumber] = useState(batch.batch_number ?? '')
  const [volume, setVolume] = useState(batch.volume_bbl != null ? String(batch.volume_bbl) : '')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const flagsRef = useRef<HTMLDivElement>(null)
  const parts = buildParts(batch)
  const brew = firstBrew(batch.steps)
  const myFlags = flags.filter((f) => f.batch_ids.includes(batch.id))
  const steps = [...batch.steps].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.position - b.position || a.id - b.id)

  useEffect(() => {
    if (focusFlags) flagsRef.current?.scrollIntoView({ block: 'start' })
  }, [focusFlags])

  const run = async (call: () => ReturnType<typeof flows.write>) => {
    const r = await call()
    setError(r.ok ? null : r.error)
    return r.ok
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth data-testid="batch-dialog">
      <DialogTitle>
        <span data-testid="batch-dialog-title">{batch.label}</span>
        <Typography variant="body2" color="text.secondary" data-testid="batch-dialog-sub">
          {[batch.template_name, batch.volume_bbl != null && `${batch.volume_bbl} bbl`, brew && (brew.done_on ? `brewed ${dayLabel(brew.done_on)}` : `brew day ${dayLabel(brew.due_on)}`), planned && 'planned']
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ErrorAlert error={error} onClose={() => setError(null)} testId="batch-dialog-error" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Typography variant="body2" sx={{ gridColumn: '1 / -1' }}>
            Template: {batch.template_name ?? '—'} · Brand: {batch.brand_name ?? '—'}
          </Typography>
          {planned ? (
            <Typography variant="body2" data-testid="batch-dialog-pnumber">
              {batch.p_number} · the real number is set when brew day is checked off
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label="Batch number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 20, 'data-testid': 'batch-number' } }}
              />
              <Button
                disabled={plainBatchNumber(number) === (batch.batch_number ?? '')}
                onClick={async () => {
                  const n = plainBatchNumber(number)
                  // Saved: the field shows the number as saved (trimmed, no #).
                  if (await run(() => flows.write(() => api.patch(prodPath('batches', batch.id), { batch_number: n }), `Batch number is now #${n}.`))) setNumber(n)
                }}
                data-testid="batch-number-save"
              >
                Save
              </Button>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              type="number"
              label="Volume (bbl)"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              slotProps={{ htmlInput: { min: 0, step: 'any', 'data-testid': 'batch-volume' } }}
            />
            <Button
              disabled={volume === '' || Number(volume) === batch.volume_bbl}
              onClick={() => run(() => flows.write(() => api.patch(prodPath('batches', batch.id), { volume_bbl: Number(volume) }), 'Volume saved.'))}
              data-testid="batch-volume-save"
            >
              Save
            </Button>
          </Box>
          {parts.map((p) => (
            <TankSelect
              key={p.key}
              label={p.vessel === 0 ? 'Ferment in' : `Transfer to (${vesselLabel(p.vessel).toLowerCase()})`}
              tanks={tanks}
              value={p.tankId}
              from={p.start}
              to={p.end}
              onChange={(id) =>
                run(() =>
                  flows.write(
                    () => api.patch(prodPath('batches', batch.id, 'vessels', p.vessel), { tank_id: id }),
                    `${batch.label}${p.vessel ? ' (after transfer)' : ''} → ${id ? (tanks.find((t) => t.id === id)?.name ?? 'tank') : 'Unassigned'}.`,
                  ),
                )
              }
              testId={`batch-tank-${p.vessel}`}
            />
          ))}
        </Box>
        {myFlags.length > 0 && (
          <Box ref={flagsRef} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="batch-flags">
            <Typography variant="subtitle2">Flags</Typography>
            {myFlags.map((f) => (
              <FlagRow key={f.key} flag={f} />
            ))}
          </Box>
        )}
        <Divider />
        <Typography variant="subtitle2">Steps</Typography>
        <Box data-testid="batch-steps">
          {steps.map((s) => (
            // Keyed on the saved values too: a change from the server starts the line afresh.
            <StepLine key={`${s.id}-${s.detail}-${s.temperature}`} step={s} batch={batch} today={today} onOpenStep={onOpenStep} />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        {planned && (
          <Button color="error" sx={{ mr: 'auto' }} onClick={() => setDeleting(true)} data-testid="batch-delete">
            Delete planned batch
          </Button>
        )}
        <Button onClick={onClose} data-testid="batch-dialog-close">
          Close
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          setDeleting(false)
          if (await run(() => flows.write(() => api.delete(prodPath('batches', batch.id)), `${batch.label} deleted.`))) onClose()
        }}
        title="Delete planned batch"
        message={`Delete ${batch.label} and all its planned steps? Other planned batches may renumber.`}
      />
    </Dialog>
  )
}
