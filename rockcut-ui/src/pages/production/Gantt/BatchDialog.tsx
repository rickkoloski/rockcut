import { useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material'
import { Add, CallSplit, DeleteOutline, EditNote, NoteAddOutlined } from '@mui/icons-material'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { useApiQuery } from '../../../hooks/useApiQuery'
import api from '../../../lib/api'
import { buildParts, dayLabel, daysBetween, dotState, firstBrew } from '../../../lib/gantt'
import {
  plainBatchNumber,
  prodPath,
  TEMPLATES_KEY,
  vesselLabel,
  type Flag,
  type Person,
  type Phase,
  type SchedBatch,
  type SchedStep,
  type StepType,
  type Tank,
  type TemplateSummary,
} from '../../../lib/production'
import type { Brand } from '../../../lib/types'
import { AddRampDialog, AddStepDialog, AddTransferDialog, SplitDialog } from './BatchChangeDialogs'
import { removeMessage, removeQuestion, removable } from './scheduleText'
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
  /** D48: for Add step…, Add a ramp… and Add transfer / filter…. */
  types: StepType[]
  phases: Phase[]
  brewers: Person[]
  /** D48: its split parts (on the schedule now). */
  parts?: SchedBatch[]
  /** Scroll to the flags (opened from a bar's badge). */
  focusFlags?: boolean
  onOpenStep: (step: SchedStep) => void
  onClose: () => void
}

/** A step's name without its addition ("Dry hop - #2" → "Dry hop"): the part that stays. */
const fixedName = (s: SchedStep) => (s.detail && s.name.endsWith(` - ${s.detail}`) ? s.name.slice(0, -(s.detail.length + 3)) : s.name)

/** One step in the batch dialog: date (a change runs the move prompt), the addition to its name, Set temp's temperature, a note button, done or late. */
function StepLine({
  step,
  batch,
  tanks,
  today,
  onOpenStep,
}: {
  step: SchedStep
  batch: SchedBatch
  tanks: Tank[]
  today: string
  onOpenStep: (s: SchedStep) => void
}) {
  const flows = useFlows()
  const [detail, setDetail] = useState(step.detail ?? '')
  const [temp, setTemp] = useState(step.temperature != null ? String(step.temperature) : '')
  const state = dotState(step, today, buildParts(batch).find((p) => p.stranded.has(step.id)))
  const done = !!step.done_on
  const patch = (body: Record<string, unknown>) => flows.write(() => api.patch(prodPath('steps', step.id), body), 'Saved.')
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

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
        {step.added && <Chip size="small" label="Added" variant="outlined" data-testid={`batch-step-added-${step.id}`} />}
        {state === 'done' && <Chip size="small" label="✓ done" color="primary" variant="outlined" />}
        {state === 'late' && <Chip size="small" label="late" color="error" variant="outlined" />}
        {state === 'stranded' && <Chip size="small" label="after the tank was emptied" color="error" variant="outlined" data-testid={`batch-step-stranded-${step.id}`} />}
        {removable(step) && (
          <Tooltip title="Remove step">
            <IconButton size="small" aria-label={`Remove ${step.name}`} onClick={() => setRemoving(true)} data-testid={`batch-step-remove-${step.id}`}>
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {removeError && (
        <Typography variant="caption" color="error" role="alert" sx={{ gridColumn: '1 / -1' }}>
          {removeError}
        </Typography>
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          setRemoving(false)
          const r = await flows.write(() => api.delete(prodPath('steps', step.id)), removeMessage(step, batch, tanks))
          setRemoveError(r.ok ? null : r.error)
        }}
        title="Remove step"
        message={removeQuestion(step, batch, tanks)}
        confirmLabel="Remove"
      />
    </Box>
  )
}

/** D48: a planned batch's brand and template (a new template rebuilds the steps; added ones are kept). */
function BrandTemplate({ batch, run }: { batch: SchedBatch; run: (call: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean> }) {
  const flows = useFlows()
  const brands = (useApiQuery<Brand[]>(['brands'], '/api/brands').data ?? []).filter((b) => b.status !== 'retired' || b.id === batch.brand_id).sort((a, b) => a.name.localeCompare(b.name))
  const templates = (useApiQuery<TemplateSummary[]>(TEMPLATES_KEY, prodPath('templates')).data ?? []).filter((t) => !t.retired_at || t.id === batch.template_id)
  const [template, setTemplate] = useState<TemplateSummary | null>(null)
  type Changed = { batches?: SchedBatch[]; message?: string }

  return (
    <>
      <TextField
        select
        size="small"
        label="Brand"
        value={brands.some((b) => b.id === batch.brand_id) ? batch.brand_id : ''}
        onChange={(e) =>
          run(() =>
            flows.write<Changed>(() => api.patch(prodPath('batches', batch.id), { brand_id: Number(e.target.value) }), (d) => `${batch.label} is now ${d.batches?.[0]?.label ?? 'changed'}.`),
          )
        }
        slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'batch-brand' } as object } }}
      >
        {brands.map((b) => (
          <MenuItem key={b.id} value={b.id} data-testid={`batch-brand-${b.id}`}>
            {b.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Template"
        value={templates.some((t) => t.id === batch.template_id) ? batch.template_id : ''}
        onChange={(e) => setTemplate(templates.find((t) => t.id === Number(e.target.value)) ?? null)}
        slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'batch-template' } as object } }}
      >
        {templates.map((t) => (
          <MenuItem key={t.id} value={t.id} disabled={t.issues.length > 0} data-testid={`batch-template-${t.id}`}>
            {t.name}
            {t.issues.length ? ' (incomplete)' : ''}
          </MenuItem>
        ))}
      </TextField>
      <ConfirmDialog
        open={!!template}
        onClose={() => setTemplate(null)}
        onConfirm={async () => {
          const t = template!
          setTemplate(null)
          await run(() => flows.write<Changed>(() => api.patch(prodPath('batches', batch.id), { template_id: t.id }), (d) => d.message ?? `Now ${t.name}.`))
        }}
        title="Change template"
        message={`Rebuild ${batch.label}’s steps from ${template?.name ?? ''}, from the same brew day? Steps you added are kept; added transfers are dropped.`}
        confirmLabel="Change template"
        confirmColor="primary"
      />
    </>
  )
}

/**
 * D47 §3.5 the batch dialog (a bar): number (P-number while planned), a tank
 * per vessel, volume, its flags with sign-off, every step in date order,
 * and Delete planned batch. D48: Add step…, Add a ramp…, Add transfer /
 * filter…, Remove on each unfinished step, "Added" chips, and a planned
 * batch's brand and template.
 */
export default function BatchDialog({ batch, tanks, flags, today, types, phases, brewers, parts: splitParts = [], focusFlags, onOpenStep, onClose }: Props) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const planned = batch.status === 'planned'
  const [number, setNumber] = useState(batch.batch_number ?? '')
  const [volume, setVolume] = useState(batch.volume_bbl != null ? String(batch.volume_bbl) : '')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState<'step' | 'ramp' | 'transfer' | 'split' | null>(null)
  const [unsplitting, setUnsplitting] = useState(false)
  const split = batch.split_parent_id != null || splitParts.length > 0
  const flagsRef = useRef<HTMLDivElement>(null)
  const parts = buildParts(batch)
  const brew = firstBrew(batch.steps)
  const myFlags = flags.filter((f) => f.batch_ids.includes(batch.id))
  const steps = [...batch.steps].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.position - b.position || a.id - b.id)

  useEffect(() => {
    if (focusFlags) flagsRef.current?.scrollIntoView({ block: 'start' })
  }, [focusFlags])

  const run = async (call: () => Promise<{ ok: boolean; error?: string }>) => {
    const r = await call()
    setError(r.ok ? null : (r.error ?? null))
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
          {planned && !batch.split_parent_id ? (
            <BrandTemplate batch={batch} run={run} />
          ) : (
            <Typography variant="body2" sx={{ gridColumn: '1 / -1' }}>
              Template: {batch.template_name ?? '—'} · Brand: {batch.brand_name ?? '—'}
            </Typography>
          )}
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
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" sx={{ mr: 'auto' }}>
            Steps
          </Typography>
          <Button size="small" startIcon={<Add />} onClick={() => setAdding('step')} data-testid="batch-add-step">
            Add step…
          </Button>
          <Button size="small" startIcon={<Add />} onClick={() => setAdding('ramp')} data-testid="batch-add-ramp">
            Add a ramp…
          </Button>
          <Button size="small" startIcon={<Add />} onClick={() => setAdding('transfer')} data-testid="batch-add-transfer">
            Add transfer / filter…
          </Button>
          {split ? (
            <Button size="small" onClick={() => setUnsplitting(true)} data-testid="batch-undo-split">
              Undo split
            </Button>
          ) : (
            <Button size="small" startIcon={<CallSplit />} onClick={() => setAdding('split')} data-testid="batch-split">
              Split…
            </Button>
          )}
        </Box>
        <Box data-testid="batch-steps">
          {steps.map((s) => (
            // Keyed on the saved values too: a change from the server starts the line afresh.
            <StepLine key={`${s.id}-${s.detail}-${s.temperature}`} step={s} batch={batch} tanks={tanks} today={today} onOpenStep={onOpenStep} />
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
      {adding === 'step' && <AddStepDialog batch={batch} types={types} tanks={tanks} brewers={brewers} today={today} onClose={() => setAdding(null)} />}
      {adding === 'ramp' && <AddRampDialog batch={batch} phases={phases} tanks={tanks} today={today} onClose={() => setAdding(null)} />}
      {adding === 'transfer' && <AddTransferDialog batch={batch} types={types} tanks={tanks} today={today} onClose={() => setAdding(null)} />}
      {adding === 'split' && <SplitDialog batch={batch} tanks={tanks} today={today} onClose={() => setAdding(null)} />}
      <ConfirmDialog
        open={unsplitting}
        onClose={() => setUnsplitting(false)}
        onConfirm={async () => {
          setUnsplitting(false)
          const parent = batch.split_parent_id != null ? batch.label.replace(/\.\d+$/, '') : batch.label
          if (await run(() => flows.write(() => api.delete(prodPath('batches', batch.id, 'split')), `Split undone: ${parent} is one batch again, with part 1’s schedule.`))) onClose()
        }}
        title="Undo split"
        message="Merge the parts back into one batch? The beer stays in the tank it was split from, with part 1’s schedule; the other parts are deleted."
        confirmLabel="Undo split"
        confirmColor="primary"
      />
    </Dialog>
  )
}
