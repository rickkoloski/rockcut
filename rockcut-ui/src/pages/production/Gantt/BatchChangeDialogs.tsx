import { useState } from 'react'
import { Box, Button, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material'
import api from '../../../lib/api'
import { dayLabel } from '../../../lib/gantt'
import { addDaysKey } from '../../../lib/datetime'
import {
  prodPath,
  rampPlan,
  vesselLabel,
  type Answer,
  type Person,
  type Phase,
  type SchedBatch,
  type SchedStep,
  type StepType,
  type Tank,
} from '../../../lib/production'
import { AnswerPicker, DialogShell } from '../EntryDialogs'
import TankSelect from './TankSelect'
import { useFlows } from './flowsContext'

// D48 §3.11 (task 3): the batch dialog's changes. Add step…, Add a ramp…,
// Add transfer / filter… and the step dialog's Change ramp…. Each is one
// write with a message and Undo (flows.write); the batch never changes its
// template.

const selectTestId = (id: string) => ({ select: { SelectDisplayProps: { 'data-testid': id } as object } })
const grid2 = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 } as const
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Written = { batches?: SchedBatch[]; step_ids?: number[]; moved?: number }

/** Steps in date order. */
const ordered = (steps: SchedStep[]) => [...steps].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.position - b.position || a.id - b.id)

/** The tank the beer is in on `day`: the latest Transfer/Filter on or before it (0 when none). */
const vesselOn = (batch: SchedBatch, day: string) =>
  Math.max(0, ...batch.steps.filter((s) => s.behavior === 'transfer' && s.due_on <= day).map((s) => s.vessel_index))

const vesselName = (batch: SchedBatch, tanks: Tank[], k: number) => {
  const id = batch.vessels.find((v) => v.vessel_index === k)?.tank_id
  return id ? (tanks.find((t) => t.id === id)?.name ?? 'Retired tank') : 'Unassigned'
}

/** The batch's new steps' names, from the write's answer. */
const newNames = (d: Written) => {
  const steps = d.batches?.[0]?.steps ?? []
  return (d.step_ids ?? []).map((id) => steps.find((s) => s.id === id)?.name).filter(Boolean) as string[]
}

/** A field error from a refused write (a changeset), else nothing. */
const fieldError = (body: Record<string, unknown> | undefined) => {
  const errors = (body?.errors ?? {}) as Record<string, string[]>
  return Object.values(errors)[0]?.[0] ?? null
}

function StepPicker({ label, steps, value, onChange, testId }: { label: string; steps: SchedStep[]; value: number | ''; onChange: (v: number | '') => void; testId: string }) {
  return (
    <TextField select fullWidth label={label} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} slotProps={selectTestId(testId)}>
      <MenuItem value="">Nothing</MenuItem>
      {steps.map((s) => (
        <MenuItem key={s.id} value={s.id} data-testid={`${testId}-${s.id}`}>
          {s.name} · {dayLabel(s.due_on)}
        </MenuItem>
      ))}
    </TextField>
  )
}

/** Comes after / leads to (both: it slots in between), each with its default answer. */
function LinkPickers({
  batch,
  from,
  to,
  prefix,
  value,
  onChange,
}: {
  batch: SchedBatch
  /** The new steps' first and last day. */
  from: string
  to: string
  prefix: string
  value: { after: number | ''; afterAnswer: Answer; leads: number | ''; leadsAnswer: Answer }
  onChange: (v: Partial<{ after: number | ''; afterAnswer: Answer; leads: number | ''; leadsAnswer: Answer }>) => void
}) {
  const steps = ordered(batch.steps)
  const afterChoices = steps.filter((s) => !from || s.due_on <= from)
  const after = value.after !== '' && afterChoices.some((s) => s.id === value.after) ? value.after : ''
  const leadsChoices = steps.filter((s) => s.behavior !== 'brew' && s.id !== after && (!to || s.due_on >= to))
  const leads = value.leads !== '' && leadsChoices.some((s) => s.id === value.leads) ? value.leads : ''
  return (
    <>
      <Box sx={grid2}>
        <StepPicker label="Comes after" steps={afterChoices} value={after} onChange={(v) => onChange({ after: v })} testId={`${prefix}-after`} />
        {after !== '' && <AnswerPicker value={value.afterAnswer} onChange={(a) => onChange({ afterAnswer: a })} testId={`${prefix}-after-answer`} />}
      </Box>
      <Box sx={grid2}>
        <StepPicker label="Leads to" steps={leadsChoices} value={leads} onChange={(v) => onChange({ leads: v })} testId={`${prefix}-leads`} />
        {leads !== '' && <AnswerPicker value={value.leadsAnswer} onChange={(a) => onChange({ leadsAnswer: a })} testId={`${prefix}-leads-answer`} />}
      </Box>
      <Typography variant="body2" color="text.secondary">
        Comes after: moving that step offers to move this one too. Leads to: moving this one offers to move that one. Pick both to slot it in between.
      </Typography>
    </>
  )
}

const linkBody = (v: { after: number | ''; afterAnswer: Answer; leads: number | ''; leadsAnswer: Answer }) => ({
  ...(v.after !== '' ? { comes_after_id: v.after, comes_after_answer: v.afterAnswer } : {}),
  ...(v.leads !== '' ? { leads_to_id: v.leads, leads_to_answer: v.leadsAnswer } : {}),
})

const noLinks = { after: '' as number | '', afterAnswer: 'move_all' as Answer, leads: '' as number | '', leadsAnswer: 'move_all' as Answer }

/** The tank when the batch has several: "The tank it's in that day" (the default), or one of its vessels. */
function VesselPicker({ batch, tanks, day, value, onChange, testId }: { batch: SchedBatch; tanks: Tank[]; day: string; value: number | ''; onChange: (v: number | '') => void; testId: string }) {
  if (batch.vessels.length < 2) return null
  const auto = day ? vesselOn(batch, day) : 0
  return (
    <TextField select label="Tank" value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} slotProps={{ ...selectTestId(testId), inputLabel: { shrink: true } }}>
      <MenuItem value="">The tank it’s in that day ({vesselName(batch, tanks, auto)})</MenuItem>
      {batch.vessels.map((v) => (
        <MenuItem key={v.vessel_index} value={v.vessel_index} data-testid={`${testId}-${v.vessel_index}`}>
          {vesselLabel(v.vessel_index)} · {vesselName(batch, tanks, v.vessel_index)}
        </MenuItem>
      ))}
    </TextField>
  )
}

const CUSTOM = 'custom'

/**
 * Add step… (§3.11, P65–P67): a type or "Something else" with its own name,
 * the addition, temperature (Set temp), Full / Partial (Package), the day,
 * the tank (when there are several), comes after / leads to, task list,
 * assignee and notes. Marked Added; the template doesn't change. Brew day,
 * transfers and splits have their own actions.
 */
export function AddStepDialog({ batch, types, tanks, brewers, today, onClose }: { batch: SchedBatch; types: StepType[]; tanks: Tank[]; brewers: Person[]; today: string; onClose: () => void }) {
  const flows = useFlows()
  const choices = types.filter((t) => !t.retired_at && !['brew', 'transfer', 'split'].includes(t.behavior))
  const [typeId, setTypeId] = useState<number | typeof CUSTOM | ''>('')
  const type = types.find((t) => t.id === typeId)
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [temperature, setTemperature] = useState('')
  const [partial, setPartial] = useState(false)
  const [day, setDay] = useState(batch.steps.some((s) => s.due_on >= today) ? today : (ordered(batch.steps).at(-1)?.due_on ?? today))
  const [vessel, setVessel] = useState<number | ''>('')
  const [links, setLinks] = useState(noLinks)
  const [onList, setOnList] = useState(true)
  const [assignee, setAssignee] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const local: Record<string, string> = {}
    if (typeId === '') local.type = 'Pick a step, or Something else.'
    if (typeId === CUSTOM && !name.trim()) local.name = 'Give the step a name.'
    if (!day) local.due_on = 'Pick the day.'
    if (type?.behavior === 'set_temp' && temperature === '') local.temperature = 'Enter the temperature.'
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    setError(null)
    const body: Record<string, unknown> = {
      due_on: day,
      detail: detail.trim() || null,
      on_task_list: onList,
      assignee_id: assignee === '' ? null : assignee,
      notes: notes.trim() || null,
      ...linkBody(links),
    }
    if (typeId === CUSTOM) body.name = name.trim()
    else body.step_type_id = typeId
    if (vessel !== '') body.vessel_index = vessel
    if (type?.behavior === 'set_temp') body.temperature = Number(temperature)
    if (type?.behavior === 'package') body.package_partial = partial
    const r = await flows.write<Written>(() => api.post(prodPath('batches', batch.id, 'steps'), body), (d) => `${newNames(d)[0] ?? 'Step'} added to ${batch.label}.`)
    setBusy(false)
    if (r.ok) return onClose()
    const f = fieldError(r.body)
    if (r.code === 'name_required') setErrors({ name: r.error })
    else setError(f ?? r.error)
  }

  return (
    <DialogShell title={`Add step · ${batch.label}`} testId="add-step-dialog" error={error} busy={busy} onClose={onClose} onSave={save} saveLabel="Add">
      <TextField
        select
        label="Step"
        value={typeId}
        autoFocus
        onChange={(e) => {
          const v = e.target.value
          const t = types.find((x) => x.id === Number(v))
          setTypeId(v === CUSTOM ? CUSTOM : v === '' ? '' : Number(v))
          if (t) setOnList(t.on_task_list)
        }}
        error={!!errors.type}
        helperText={errors.type ?? type?.full_name}
        slotProps={selectTestId('add-step-type')}
      >
        {choices.map((t) => (
          <MenuItem key={t.id} value={t.id} data-testid={`add-step-type-${t.id}`}>
            {t.name}
            {t.full_name ? ` (${t.full_name})` : ''}
          </MenuItem>
        ))}
        <MenuItem value={CUSTOM} data-testid="add-step-type-custom">
          Something else
        </MenuItem>
      </TextField>
      {typeId === CUSTOM && (
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!errors.name}
          helperText={errors.name}
          slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'add-step-name' } }}
        />
      )}
      {typeId !== CUSTOM && (
        <TextField
          label={`Add to the name (“${type?.name ?? 'Step'}${type?.behavior === 'package' && partial ? ' - Partial' : ''}” stays)`}
          placeholder="e.g. raspberry puree"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'add-step-detail' } }}
        />
      )}
      {type?.behavior === 'set_temp' && (
        <TextField
          label="Temperature (°F)"
          type="number"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          error={!!errors.temperature}
          helperText={errors.temperature ?? '28–80°F'}
          slotProps={{ htmlInput: { min: 28, max: 80, 'data-testid': 'add-step-temperature' } }}
        />
      )}
      {type?.behavior === 'package' && (
        <TextField select label="Package" value={partial ? 'partial' : 'full'} onChange={(e) => setPartial(e.target.value === 'partial')} slotProps={selectTestId('add-step-package')}>
          <MenuItem value="full">Full</MenuItem>
          <MenuItem value="partial" data-testid="add-step-package-partial">
            Partial
          </MenuItem>
        </TextField>
      )}
      <Box sx={grid2}>
        <TextField
          type="date"
          label="Day"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          error={!!errors.due_on}
          helperText={errors.due_on}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'add-step-day' } }}
        />
        <VesselPicker batch={batch} tanks={tanks} day={day} value={vessel} onChange={setVessel} testId="add-step-tank" />
      </Box>
      <LinkPickers batch={batch} from={day} to={day} prefix="add-step" value={links} onChange={(v) => setLinks((l) => ({ ...l, ...v }))} />
      <TextField select label="Assigned to" value={assignee} onChange={(e) => setAssignee(e.target.value === '' ? '' : Number(e.target.value))} slotProps={selectTestId('add-step-assignee')}>
        <MenuItem value="">Nobody</MenuItem>
        {brewers.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={<Switch checked={onList} onChange={(e) => setOnList(e.target.checked)} slotProps={{ input: { 'data-testid': 'add-step-task-list' } as object }} />}
        label="Show on the Brewery task list"
      />
      <TextField label="Notes" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000, 'data-testid': 'add-step-notes' } }} />
    </DialogShell>
  )
}

/** Add a ramp… (§3.11, P68): Set temp steps a day apart, chained, the first starting the phase picked (Crash). */
export function AddRampDialog({ batch, phases, tanks, today, onClose }: { batch: SchedBatch; phases: Phase[]; tanks: Tank[]; today: string; onClose: () => void }) {
  const flows = useFlows()
  const crash = phases.find((p) => !p.retired_at && p.name.toLowerCase() === 'crash')
  const [start, setStart] = useState('58')
  const [target, setTarget] = useState('32')
  const [change, setChange] = useState('10')
  const [firstOn, setFirstOn] = useState(today)
  const [vessel, setVessel] = useState<number | ''>('')
  const [phaseId, setPhaseId] = useState<number | ''>(crash?.id ?? '')
  const [links, setLinks] = useState(noLinks)
  const [onList, setOnList] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const plan = rampPlan(start, target, change)
  const temps = 'temps' in plan ? plan.temps : []
  const lastOn = firstOn ? addDaysKey(firstOn, Math.max(temps.length, 1) - 1) : ''

  const save = async () => {
    if ('error' in plan) return setError(plan.error)
    if (!firstOn) return setError('Pick the first day.')
    setBusy(true)
    setError(null)
    const body: Record<string, unknown> = {
      start: Number(start),
      target: Number(target),
      change_per_day: Number(change),
      first_on: firstOn,
      phase_id: phaseId === '' ? null : phaseId,
      on_task_list: onList,
      ...linkBody(links),
    }
    if (vessel !== '') body.vessel_index = vessel
    const r = await flows.write<Written>(() => api.post(prodPath('batches', batch.id, 'ramp'), body), `Ramp added to ${batch.label}: ${temps.map((t) => `${t}°`).join(', ')}.`)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  return (
    <DialogShell title={`Add a ramp · ${batch.label}`} testId="add-ramp-dialog" error={error} busy={busy} onClose={onClose} onSave={save} saveLabel="Add ramp">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <TextField label="Start (°F)" type="number" value={start} onChange={(e) => setStart(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'add-ramp-start' } }} />
        <TextField label="Target (°F)" type="number" value={target} onChange={(e) => setTarget(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'add-ramp-target' } }} />
        <TextField label="Change per day (°F)" type="number" value={change} onChange={(e) => setChange(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'add-ramp-change' } }} />
      </Box>
      <Box sx={grid2}>
        <TextField type="date" label="First day" value={firstOn} onChange={(e) => setFirstOn(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'add-ramp-first-on' } }} />
        <VesselPicker batch={batch} tanks={tanks} day={firstOn} value={vessel} onChange={setVessel} testId="add-ramp-tank" />
      </Box>
      <Typography variant="body2" data-testid="add-ramp-preview" role={'error' in plan ? 'alert' : undefined} color={'error' in plan ? 'error' : 'text.primary'}>
        {'error' in plan
          ? plan.error
          : `${plural(temps.length, 'Set temp step')}: ${temps.map((t) => `${t}°`).join(', ')}${firstOn ? `, ${dayLabel(firstOn)}${temps.length > 1 ? ` – ${dayLabel(lastOn)}` : ''}` : ''}.`}
      </Typography>
      <TextField select label="The first step starts" value={phaseId} onChange={(e) => setPhaseId(e.target.value === '' ? '' : Number(e.target.value))} slotProps={selectTestId('add-ramp-phase')}>
        <MenuItem value="">No phase</MenuItem>
        {phases
          .filter((p) => !p.retired_at)
          .map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
      </TextField>
      <LinkPickers batch={batch} from={firstOn} to={lastOn} prefix="add-ramp" value={links} onChange={(v) => setLinks((l) => ({ ...l, ...v }))} />
      <FormControlLabel
        control={<Switch checked={onList} onChange={(e) => setOnList(e.target.checked)} slotProps={{ input: { 'data-testid': 'add-ramp-task-list' } as object }} />}
        label="Show on the Brewery task list"
      />
    </DialogShell>
  )
}

/**
 * Change ramp… (§3.11, P69): a new target and/or change per day. Only the
 * ramp's unfinished steps are rebuilt, from the last finished temperature
 * (or the start).
 */
export function ChangeRampDialog({ step, batch, onClose, onDone }: { step: SchedStep; batch: SchedBatch; onClose: () => void; onDone: () => void }) {
  const flows = useFlows()
  const group = ordered(batch.steps.filter((s) => s.ramp_group && s.ramp_group === step.ramp_group))
  const done = group.filter((s) => s.done_on)
  const from = (done.at(-1) ?? group[0])?.temperature ?? 0
  const current = group.length > 1 ? Math.abs((group[0].temperature ?? 0) - (group[1].temperature ?? 0)) : 1
  const [target, setTarget] = useState(String(group.at(-1)?.temperature ?? ''))
  const [change, setChange] = useState(String(current || 1))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const plan = rampPlan(String(from), target, change)
  const temps = 'temps' in plan ? (done.length ? plan.temps.slice(1) : plan.temps) : []

  const save = async () => {
    if ('error' in plan) return setError(plan.error)
    setBusy(true)
    setError(null)
    const r = await flows.write(
      () => api.post(prodPath('steps', step.id, 'ramp'), { target: Number(target), change_per_day: Number(change) }),
      `Ramp changed: ${temps.map((t) => `${t}°`).join(', ')}.`,
    )
    setBusy(false)
    if (r.ok) onDone()
    else setError(r.error)
  }

  return (
    <DialogShell title="Change ramp" testId="change-ramp-dialog" error={error} busy={busy} onClose={onClose} onSave={save} saveLabel="Change ramp">
      <Typography variant="body2" color="text.secondary">
        Now: {group.map((s) => `${s.temperature}°${s.done_on ? ' ✓' : ''}`).join(', ')}. {done.length ? `Done steps stay; it carries on from ${from}°.` : `It starts at ${from}°.`}
      </Typography>
      <Box sx={grid2}>
        <TextField label="Target (°F)" type="number" value={target} onChange={(e) => setTarget(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'change-ramp-target' } }} />
        <TextField label="Change per day (°F)" type="number" value={change} onChange={(e) => setChange(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'change-ramp-change' } }} />
      </Box>
      <Typography variant="body2" data-testid="change-ramp-preview" role={'error' in plan ? 'alert' : undefined} color={'error' in plan ? 'error' : 'text.primary'}>
        {'error' in plan ? plan.error : `New steps: ${temps.map((t) => `${t}°`).join(', ') || 'none'}.`}
      </Typography>
    </DialogShell>
  )
}

/**
 * Add transfer / filter… (§3.11, P72–P73): Transfer or Filter, the day, the
 * tank it goes into (or Unassigned). The unfinished steps from that day move
 * there and the tank left behind gets a CIP & Sanitize that day.
 */
export function AddTransferDialog({ batch, types, tanks, today, onClose }: { batch: SchedBatch; types: StepType[]; tanks: Tank[]; today: string; onClose: () => void }) {
  const flows = useFlows()
  const kinds = types.filter((t) => !t.retired_at && t.behavior === 'transfer')
  const [typeId, setTypeId] = useState<number | ''>(kinds[0]?.id ?? '')
  const [day, setDay] = useState(today)
  const [tankId, setTankId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const kind = kinds.find((t) => t.id === typeId)?.name ?? 'Transfer'
  const k = day ? vesselOn(batch, day) : 0
  const fill = (s: SchedStep) => (k === 0 ? s.first_brew : s.behavior === 'transfer' && s.vessel_index === k)
  const moving = batch.steps.filter((s) => s.vessel_index === k && !fill(s) && !s.done_on && s.due_on >= day)
  const doneLater = batch.steps.some((s) => s.vessel_index >= k && !fill(s) && s.done_on && s.due_on > day)
  const tankName = tankId ? (tanks.find((t) => t.id === tankId)?.name ?? 'the tank') : 'Unassigned'

  const save = async () => {
    if (!day) return setError('Pick the day.')
    setBusy(true)
    setError(null)
    const r = await flows.write<Written>(
      () => api.post(prodPath('batches', batch.id, 'transfers'), { step_type_id: typeId === '' ? null : typeId, due_on: day, tank_id: tankId }),
      (d) => `${kind} on ${dayLabel(day)}: ${plural(d.moved ?? 0, 'step')} of ${batch.label} move to ${tankName}; ${vesselName(batch, tanks, k)} gets a CIP & Sanitize that day.`,
    )
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  return (
    <DialogShell title={`Add transfer / filter · ${batch.label}`} testId="add-transfer-dialog" error={error} busy={busy} onClose={onClose} onSave={save} saveLabel="Add">
      <TextField select label="Transfer or filter" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))} slotProps={selectTestId('add-transfer-type')}>
        {kinds.map((t) => (
          <MenuItem key={t.id} value={t.id} data-testid={`add-transfer-type-${t.id}`}>
            {t.name}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={grid2}>
        <TextField type="date" label="Day" value={day} onChange={(e) => setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'add-transfer-day' } }} />
        <TankSelect label="Into" tanks={tanks} value={tankId} onChange={setTankId} from={day} testId="add-transfer-tank" />
      </Box>
      <Typography variant="body2" color={doneLater ? 'error' : 'text.secondary'} role={doneLater ? 'alert' : undefined} data-testid="add-transfer-preview">
        {doneLater
          ? 'Some steps after that date are already done. Pick a later date.'
          : `${plural(moving.length, 'step')} from that day (${moving.map((s) => s.name).join(', ') || 'none'}) move to ${tankName}; ${vesselName(batch, tanks, k)} gets a CIP & Sanitize that day.`}
      </Typography>
    </DialogShell>
  )
}

type PartRow = { tank: number | 'stay' | null; volume: string }

/**
 * Split… (§3.11, P75–P78, P110): the day, Transfer or Filter for every part
 * that leaves, and two or more parts, each with a tank (one may stay in the
 * tank the beer is in) and a volume; a live total against the batch's.
 */
export function SplitDialog({ batch, tanks, today, onClose }: { batch: SchedBatch; tanks: Tank[]; today: string; onClose: () => void }) {
  const flows = useFlows()
  const brew = batch.steps.filter((s) => s.first_brew)[0]
  const [day, setDay] = useState(brew && brew.due_on >= today ? addDaysKey(brew.due_on, 1) : today)
  const [method, setMethod] = useState<'transfer' | 'filter'>('transfer')
  const volume = batch.volume_bbl ?? 0
  const half = String(Math.round((volume / 2) * 100) / 100)
  const [parts, setParts] = useState<PartRow[]>([
    { tank: 'stay', volume: half },
    { tank: null, volume: String(Math.round((volume - Number(half)) * 100) / 100) },
  ])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const here = day ? vesselName(batch, tanks, vesselOn(batch, day)) : '—'
  const total = parts.reduce((t, p) => t + (Number(p.volume) || 0), 0)
  const adds = Math.abs(total - volume) < 0.001
  const set = (i: number, change: Partial<PartRow>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...change } : p)))
  const tankName = (p: PartRow) => (p.tank === 'stay' ? here : p.tank ? (tanks.find((t) => t.id === p.tank)?.name ?? 'tank') : 'Unassigned')

  const save = async () => {
    if (!day) return setError('Pick the day.')
    setBusy(true)
    setError(null)
    const body = {
      due_on: day,
      split_method: method,
      parts: parts.map((p) => ({ stays: p.tank === 'stay', tank_id: p.tank === 'stay' ? null : p.tank, volume_bbl: Number(p.volume) })),
    }
    const r = await flows.write<{ batches?: SchedBatch[]; part_ids?: number[] }>(
      () => api.post(prodPath('batches', batch.id, 'split'), body),
      (d) => {
        const label = (id: number) => d.batches?.find((b) => b.id === id)?.label ?? 'A part'
        const each = (d.part_ids ?? []).map((id, i) => `${label(id)} (${Number(parts[i].volume)} bbl) ${parts[i].tank === 'stay' ? `stays in ${here}` : `→ ${tankName(parts[i])}`}`)
        return `${batch.label} split on ${dayLabel(day)}: ${each.join('; ')}.`
      },
    )
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  return (
    <DialogShell title={`Split · ${batch.label}`} testId="split-dialog" error={error} busy={busy} onClose={onClose} onSave={save} saveLabel="Split">
      <Box sx={grid2}>
        <TextField type="date" label="Day" value={day} onChange={(e) => setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'split-day' } }} />
        <TextField
          select
          label="How the parts leave"
          value={method}
          onChange={(e) => setMethod(e.target.value as 'transfer' | 'filter')}
          helperText="Every part that leaves the tank goes this way."
          slotProps={selectTestId('split-method')}
        >
          <MenuItem value="transfer" data-testid="split-method-transfer">
            Transfer
          </MenuItem>
          <MenuItem value="filter" data-testid="split-method-filter">
            Filter
          </MenuItem>
        </TextField>
      </Box>
      {parts.map((p, i) => (
        <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px auto', gap: 1, alignItems: 'center' }} data-testid={`split-part-${i}`}>
          <TextField
            select
            label={`Part ${i + 1}`}
            value={p.tank ?? ''}
            onChange={(e) => set(i, { tank: e.target.value === 'stay' ? 'stay' : e.target.value === '' ? null : Number(e.target.value) })}
            slotProps={{ ...selectTestId(`split-tank-${i}`), inputLabel: { shrink: true } }}
          >
            <MenuItem value="stay" disabled={parts.some((q, j) => j !== i && q.tank === 'stay')} data-testid={`split-tank-${i}-stay`}>
              {here} (stays here)
            </MenuItem>
            <MenuItem value="" data-testid={`split-tank-${i}-none`}>
              Unassigned
            </MenuItem>
            {tanks
              .filter((t) => !t.retired_at)
              .map((t) => (
                <MenuItem key={t.id} value={t.id} data-testid={`split-tank-${i}-${t.id}`}>
                  {t.name} · {t.capacity_bbl} bbl
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="bbl"
            type="number"
            value={p.volume}
            onChange={(e) => set(i, { volume: e.target.value })}
            slotProps={{ htmlInput: { min: 0, step: 'any', 'data-testid': `split-volume-${i}` } }}
          />
          <Button size="small" disabled={parts.length <= 2} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} data-testid={`split-remove-${i}`}>
            Remove
          </Button>
        </Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button size="small" onClick={() => setParts((ps) => [...ps, { tank: null, volume: '' }])} data-testid="split-add-part">
          Add part
        </Button>
        <Typography variant="body2" color={adds ? 'text.secondary' : 'error'} data-testid="split-total" sx={{ ml: 'auto' }}>
          Total {Math.round(total * 100) / 100} of {volume} bbl
        </Typography>
      </Box>
    </DialogShell>
  )
}
