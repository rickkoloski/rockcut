import { useLayoutEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import api from '../../../lib/api'
import { dayLabel, daysBetween } from '../../../lib/gantt'
import { dayN, removable, removeMessage, removeQuestion, stepStatus } from './scheduleText'
import { ChangeRampDialog } from './BatchChangeDialogs'
import { answerLabel, CIP_METHODS, prodPath, type CipMethod, type Person, type SchedBatch, type SchedStep, type Tank } from '../../../lib/production'
import ErrorAlert from '../ErrorAlert'
import { useFlows } from './flowsContext'
import DateField from '../DateField'

interface Props {
  step: SchedStep
  /** Its batch; null for a standalone CIP & Sanitize. */
  batch: SchedBatch | null
  tanks: Tank[]
  brewers: Person[]
  today: string
  /** D49 §3.12a: a done Sanitize that found the tank dirty. */
  sanitizedDirty?: boolean
  onClose: () => void
}

const tankOf = (step: SchedStep, batch: SchedBatch | null, tanks: Tank[]) => {
  const id = batch ? batch.vessels.find((v) => v.vessel_index === step.vessel_index)?.tank_id : step.tank_id
  return id ? (tanks.find((t) => t.id === id)?.name ?? 'Retired tank') : 'No tank'
}

/**
 * D47 §3.5 the step dialog (and §3.10 a standalone CIP's): what it is,
 * when, its status and links; edit its temperature, Full / Partial, the
 * addition to its name, assignee, notes and task-list switch; check it off,
 * move it, or mark it not done. Typed changes are saved when it closes or a
 * button is pressed. D48: Remove step, and Change ramp… on a ramp's step.
 * D49 §3.12a: an unfinished CIP switches between CIP & Sanitize, CIP - no
 * sani and Sanitize; a Sanitize done on a dirty tank says so.
 */
export default function StepDialog({ step, batch, tanks, brewers, today, sanitizedDirty, onClose }: Props) {
  const flows = useFlows()
  const cip = step.batch_id == null
  const [temperature, setTemperature] = useState(step.temperature != null ? String(step.temperature) : '')
  const [partial, setPartial] = useState(step.package_partial)
  const [method, setMethod] = useState<CipMethod>(step.cip_method ?? 'sanitize_full')
  const [detail, setDetail] = useState(step.detail ?? '')
  const [assignee, setAssignee] = useState<number | ''>(step.assignee_id ?? '')
  const [notes, setNotes] = useState(step.notes ?? '')
  const [onList, setOnList] = useState(step.on_task_list)
  const [doneOn, setDoneOn] = useState(today)
  const [moveTo, setMoveTo] = useState(step.due_on)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // D48: Remove step and Change ramp….
  const [removing, setRemoving] = useState(false)
  const [changingRamp, setChangingRamp] = useState(false)
  const closing = useRef(false)
  // The button an action started from: it's disabled while busy, which
  // drops focus to the page, and the dialog's focus trap only looks every
  // 50 ms, so Escape pressed as the refusal shows went nowhere. Focus goes
  // back to it as soon as it's enabled again.
  const trigger = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (busy || !trigger.current) return
    if (document.activeElement === document.body && trigger.current.isConnected) trigger.current.focus()
    trigger.current = null
  }, [busy])
  const byId = new Map((batch?.steps ?? []).map((s) => [s.id, s]))
  const after = (batch?.links ?? []).filter((l) => l.from_step_id === step.id)
  const before = (batch?.links ?? []).filter((l) => l.to_step_id === step.id)
  const done = !!step.done_on

  const changes = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    if (step.behavior === 'set_temp' && temperature !== '' && Number(temperature) !== step.temperature) c.temperature = Number(temperature)
    if (step.behavior === 'package' && !done && partial !== step.package_partial) c.package_partial = partial
    if (step.behavior === 'cip' && !done && method !== (step.cip_method ?? 'sanitize_full')) c.cip_method = method
    if (!cip && (detail.trim() || null) !== step.detail) c.detail = detail.trim() || null
    if ((assignee === '' ? null : assignee) !== step.assignee_id) c.assignee_id = assignee === '' ? null : assignee
    if ((notes.trim() || null) !== (step.notes ?? null)) c.notes = notes.trim() || null
    if (!cip && !step.marker && onList !== step.on_task_list) c.on_task_list = onList
    return c
  }

  /** Save what's been typed; false (with the error shown) if it was refused. */
  const save = async (): Promise<boolean> => {
    const c = changes()
    if (!Object.keys(c).length) return true
    const path = cip ? prodPath('cips', step.id) : prodPath('steps', step.id)
    const r = await flows.write(() => api.patch(path, c), 'Saved.')
    if (!r.ok) {
      const fields = (r.body?.errors ?? {}) as Record<string, string[]>
      setError(Object.values(fields)[0]?.[0] ?? r.error)
      return false
    }
    return true
  }

  const close = async () => {
    if (closing.current) return
    closing.current = true
    // Typed notes (and the rest) are kept when the dialog closes.
    if (Object.keys(changes()).length && !(await save())) {
      closing.current = false
      return
    }
    onClose()
  }
  usePhoneBackCloses(true, close)

  const act = async (fn: () => Promise<{ ok: boolean; error?: string } | null>) => {
    trigger.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setBusy(true)
    setError(null)
    try {
      if (!(await save())) return
      const r = await fn()
      if (r && !r.ok) setError(r.error ?? 'Something went wrong. Try again.')
      else if (r) onClose()
    } finally {
      setBusy(false)
    }
  }

  const moveDays = daysBetween(step.due_on, moveTo)
  const typeName = step.type_name ?? step.name

  return (
    <Dialog open onClose={close} maxWidth="sm" fullWidth data-testid="step-dialog">
      <DialogTitle>
        <span data-testid="step-dialog-name">{cip ? `${step.name} · ${tankOf(step, null, tanks)}` : step.name}</span>
        {step.full_name && (
          <Typography variant="body2" color="text.secondary">
            {step.full_name}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <ErrorAlert error={error} testId="step-dialog-error" />
        <Box>
          {batch && (
            <Typography variant="body2" data-testid="step-dialog-where">
              {batch.label} · {tankOf(step, batch, tanks)}
              {batch.template_name ? ` · ${batch.template_name}` : ''}
            </Typography>
          )}
          <Typography variant="body2" data-testid="step-dialog-when">
            {dayLabel(step.due_on)}
            {dayN(step, batch) ? ` · ${dayN(step, batch)}` : ''}
          </Typography>
          <Typography variant="body2" color={!done && step.due_on < today ? 'error.main' : 'text.secondary'} data-testid="step-dialog-status">
            {stepStatus(step, today)}
          </Typography>
        </Box>
        {(after.length > 0 || before.length > 0) && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }} data-testid="step-dialog-links">
            <Box>
              <Typography variant="caption" color="text.secondary">
                Before this
              </Typography>
              {before.map((l) => (
                <Typography key={l.id} variant="body2">
                  {byId.get(l.from_step_id)?.name ?? '?'}
                </Typography>
              ))}
              {!before.length && <Typography variant="body2">Nothing</Typography>}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                After this
              </Typography>
              {after.map((l) => (
                <Typography key={l.id} variant="body2">
                  {byId.get(l.to_step_id)?.name ?? '?'} · {answerLabel(l.default_answer) === 'moves with it' ? 'Moves with it by default' : 'Stays by default'}
                </Typography>
              ))}
              {!after.length && <Typography variant="body2">Nothing</Typography>}
            </Box>
          </Box>
        )}
        <Divider />
        {step.behavior === 'set_temp' && step.ramp_group && batch && !done && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              Part of a ramp: {batch.steps.filter((s) => s.ramp_group === step.ramp_group).length} Set temp steps.
            </Typography>
            <Button size="small" disabled={busy} onClick={() => setChangingRamp(true)} data-testid="step-change-ramp">
              Change ramp…
            </Button>
          </Box>
        )}
        {step.behavior === 'set_temp' && (
          <TextField
            label="Temperature (°F)"
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
            helperText="28–80°F"
            slotProps={{ htmlInput: { min: 28, max: 80, 'data-testid': 'step-temperature' } }}
          />
        )}
        {step.behavior === 'package' && !done && (
          <TextField
            select
            label="Package"
            value={partial ? 'partial' : 'full'}
            onChange={(e) => setPartial(e.target.value === 'partial')}
            helperText={partial ? 'Packages some of the beer; the rest stays in the tank.' : 'Packages all of it and empties the tank.'}
            slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'step-package' } as object } }}
          >
            <MenuItem value="full" data-testid="step-package-full">
              Full
            </MenuItem>
            <MenuItem value="partial" data-testid="step-package-partial">
              Partial
            </MenuItem>
          </TextField>
        )}
        {sanitizedDirty && (
          <Typography variant="body2" color="warning.main" data-testid="step-sanitize-dirty">
            The tank was dirty: run a CIP first.
          </Typography>
        )}
        {step.behavior === 'cip' && !done && (
          <TextField
            select
            label="Process"
            value={method}
            onChange={(e) => setMethod(e.target.value as CipMethod)}
            helperText={CIP_METHODS.find((m) => m.key === method)!.hint}
            slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'step-cip-method' } as object } }}
          >
            {CIP_METHODS.map((m) => (
              <MenuItem key={m.key} value={m.key} data-testid={`step-cip-method-${m.key}`}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {!cip && !step.marker && (
          <TextField
            label={`Add to the name (“${typeName}” stays)`}
            placeholder="e.g. #2"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'step-detail' } }}
          />
        )}
        <TextField
          select
          label="Assigned to"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value === '' ? '' : Number(e.target.value))}
          slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'step-assignee' } as object } }}
        >
          <MenuItem value="">Nobody</MenuItem>
          {brewers.map((p) => (
            <MenuItem key={p.id} value={p.id} data-testid={`step-assignee-${p.id}`}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Notes"
          multiline
          minRows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 2000, 'data-testid': 'step-notes' } }}
        />
        {/* D49 decision 6.1: a phase marker never has a task. */}
        {!cip && !step.marker && (
          <FormControlLabel
            control={<Switch checked={onList} onChange={(e) => setOnList(e.target.checked)} slotProps={{ input: { 'data-testid': 'step-task-list' } as object }} />}
            label="Show on the Brewery task list"
          />
        )}
        <Divider />
        {done ? (
          <Box>
            <Button variant="outlined" disabled={busy} onClick={() => act(() => flows.uncheck(step))} data-testid="step-uncheck">
              Mark not done
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <DateField
                size="small"
                label="Done on"
                value={doneOn}
                onCommit={setDoneOn}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, 'data-testid': 'step-done-on' } }}
              />
              <Button variant="contained" disabled={busy || !doneOn} onClick={() => act(() => flows.checkOff(step, doneOn, batch?.label ?? null))} data-testid="step-check-off">
                Check off
              </Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <DateField
                size="small"
                label="Or move to"
                value={moveTo}
                onCommit={setMoveTo}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'step-move-to' } }}
              />
              <Button variant="outlined" disabled={busy || !moveTo || moveDays === 0} onClick={() => act(() => flows.moveSteps([step.id], moveDays))} data-testid="step-move">
                Move
              </Button>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {cip && (
          <Button color="error" sx={{ mr: 'auto' }} disabled={busy} onClick={() => setDeleting(true)} data-testid="cip-delete">
            Delete
          </Button>
        )}
        {!cip && batch && removable(step) && (
          <Button color="error" sx={{ mr: 'auto' }} disabled={busy} onClick={() => setRemoving(true)} data-testid="step-remove">
            Remove step
          </Button>
        )}
        <Button onClick={close} disabled={busy} data-testid="step-dialog-close">
          Close
        </Button>
        <Button variant="contained" disabled={busy} onClick={() => act(async () => ({ ok: true }))} data-testid="step-dialog-save">
          Save
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false)
          act(() => flows.write(() => api.delete(prodPath('cips', step.id)), `${step.name} deleted.`))
        }}
        title={`Delete ${step.name}`}
        message={`Delete the ${step.name} in ${tankOf(step, null, tanks)} on ${dayLabel(step.due_on)}?`}
      />
      {batch && (
        <ConfirmDialog
          open={removing}
          onClose={() => setRemoving(false)}
          onConfirm={() => {
            setRemoving(false)
            // Unsaved typing goes with the step: nothing to save first.
            setBusy(true)
            flows.write(() => api.delete(prodPath('steps', step.id)), removeMessage(step, batch, tanks)).then((r) => {
              setBusy(false)
              if (r.ok) onClose()
              else setError(r.error)
            })
          }}
          title="Remove step"
          message={removeQuestion(step, batch, tanks)}
          confirmLabel="Remove"
        />
      )}
      {changingRamp && batch && <ChangeRampDialog step={step} batch={batch} onClose={() => setChangingRamp(false)} onDone={onClose} />}
    </Dialog>
  )
}
