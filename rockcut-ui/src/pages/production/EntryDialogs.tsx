import { useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Close } from '@mui/icons-material'
import ConfirmDialog from '../../components/ConfirmDialog'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import type { ApiResponse } from '../../lib/types'
import ErrorAlert from './ErrorAlert'
import {
  fieldErrors,
  prodError,
  existingTanks,
  newTankFor,
  prodPath,
  rampPlan,
  linkChoices,
  pickedLinks,
  transferOrderError,
  vesselLabel,
  vesselPhrase,
  SPLIT_METHODS,
  CIP_METHODS,
  cipLabel,
  dayWord,
  templateDayLabel,
  type Answer,
  type CipMethod,
  type Phase,
  type SplitMethod,
  type StepType,
  type Template,
  type TemplateStep,
} from '../../lib/production'
import { retestDays } from '../../lib/testResults'

/** Every change answers the whole template; the editor shows it. */
export type OnTemplate = (t: Template, message?: string) => void

const ANSWERS: { key: Answer; label: string }[] = [
  { key: 'move_all', label: 'Moves with it by default' },
  { key: 'move_only', label: 'Stays by default' },
]

const stepLabel = (s: TemplateStep) => `${s.name} · ${dayWord(s.day_offset)}${s.vessel_index ? ` · ${vesselLabel(s.vessel_index)}` : ''}`

const selectTestId = (id: string) => ({ select: { SelectDisplayProps: { 'data-testid': id } as object } })

function StepPicker({
  label,
  steps,
  value,
  onChange,
  testId,
  helper,
}: {
  label: string
  steps: TemplateStep[]
  value: number | ''
  onChange: (v: number | '') => void
  testId: string
  helper?: string
}) {
  return (
    <TextField
      select
      fullWidth
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      helperText={helper}
      slotProps={selectTestId(testId)}
    >
      <MenuItem value="">Nothing</MenuItem>
      {steps.map((s) => (
        <MenuItem key={s.id} value={s.id} data-testid={`${testId}-${s.id}`}>
          {stepLabel(s)}
        </MenuItem>
      ))}
    </TextField>
  )
}

export function AnswerPicker({ value, onChange, testId }: { value: Answer; onChange: (a: Answer) => void; testId: string }) {
  return (
    <TextField select label="When it moves" value={value} onChange={(e) => onChange(e.target.value as Answer)} slotProps={selectTestId(testId)}>
      {ANSWERS.map((a) => (
        <MenuItem key={a.key} value={a.key} data-testid={`${testId}-${a.key}`}>
          {a.label}
        </MenuItem>
      ))}
    </TextField>
  )
}

/** A tank among `choices` (vessel indexes): the existing tanks, or a transfer's one new tank. */
function TankPicker({
  choices,
  value,
  onChange,
  label = 'Tank',
  helper,
  disabled,
  testId,
}: {
  choices: number[]
  value: number
  onChange: (v: number) => void
  label?: string
  helper?: string
  disabled?: boolean
  testId: string
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      disabled={disabled}
      helperText={helper}
      onChange={(e) => onChange(Number(e.target.value))}
      slotProps={selectTestId(testId)}
    >
      {choices.map((k) => (
        <MenuItem key={k} value={k} data-testid={`${testId}-${k}`}>
          {vesselLabel(k)}
        </MenuItem>
      ))}
    </TextField>
  )
}

/** The existing tanks, plus `current` if it isn't one (an entry left in a tank whose transfer was removed). */
const tankChoices = (t: Template, current: number) => [...new Set([...existingTanks(t), current])].sort((a, b) => a - b)

/** Steps on the same day or earlier ("comes after") / later ("leads to"). */
const onOrBefore = (steps: TemplateStep[], day: number | null) => (day == null ? steps : steps.filter((s) => s.day_offset <= day))
const onOrAfter = (steps: TemplateStep[], day: number | null) =>
  steps.filter((s) => s.behavior !== 'brew' && (day == null || s.day_offset >= day))

export function DialogShell({
  title,
  testId,
  error,
  busy,
  onClose,
  onSave,
  saveLabel = 'Save',
  closeLabel = 'Cancel',
  children,
}: {
  title: string
  testId: string
  error: string | null
  busy: boolean
  onClose: () => void
  onSave: () => void
  saveLabel?: string
  /** "Close" when parts of the dialog have saved already (links). */
  closeLabel?: string
  children: React.ReactNode
}) {
  usePhoneBackCloses(true, onClose)
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid={testId}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave()
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <ErrorAlert error={error} testId={`${testId}-error`} />
          {children}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy} data-testid={`${testId}-cancel`}>
            {closeLabel}
          </Button>
          <Button type="submit" variant="contained" disabled={busy} data-testid={`${testId}-save`}>
            {busy ? <CircularProgress size={20} /> : saveLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

/** D56 decision 7: the API's refusal of an entry before brew day (null when it may go there). */
const notBeforeBrew = (behavior: string | null, name: string) =>
  behavior === 'plain' ? null : `A ${behavior == null ? 'phase marker' : name} can't be before brew day.`

const grid2 = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 } as const

interface EntryProps {
  template: Template
  types: StepType[]
  phases: Phase[]
  /** A step (with a type) or a phase start. */
  kind: 'step' | 'marker'
  /** The entry to change; none = add. */
  entry: TemplateStep | null
  onClose: () => void
  onDone: OnTemplate
}

/**
 * D46 §3.4 Add step / Add phase start, and Edit for either. Adding a step
 * can link it in: "comes after" and "leads to" (both = slot it in between).
 * Editing shows the entry's links, each with its default answer and Remove,
 * and adds new ones: the Link button saves one at once, and (D50 §2.6) Save
 * links whatever is picked, after the entry's own changes are saved.
 */
export function EntryDialog({ template, types, phases, kind, entry, onClose, onDone }: EntryProps) {
  const marker = kind === 'marker'
  const isBrew = entry?.behavior === 'brew'
  // Pickers offer active types (no second Brew day) and active phases, plus the entry's own.
  const typeChoices = types.filter((t) => (!t.retired_at && t.behavior !== 'brew') || t.id === entry?.step_type_id)
  const phaseChoices = phases.filter((p) => !p.retired_at || p.id === entry?.phase_id)
  const [typeId, setTypeId] = useState<number | ''>(entry?.step_type_id ?? '')
  const type = types.find((t) => t.id === typeId)
  const [detail, setDetail] = useState(entry?.detail ?? '')
  const [temperature, setTemperature] = useState(entry?.temperature != null ? String(entry.temperature) : '')
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(entry?.split_method ?? 'transfer')
  const [packagePartial, setPackagePartial] = useState(entry?.package_partial ?? false)
  const [cipMethod, setCipMethod] = useState<CipMethod>(entry?.cip_method ?? 'sanitize_full')
  const [day, setDay] = useState(String(entry?.day_offset ?? ''))
  const [vessel, setVessel] = useState(entry?.vessel_index ?? 0)
  const [phaseId, setPhaseId] = useState<number | ''>(entry ? (entry.phase_id ?? '') : '')
  const [onTaskList, setOnTaskList] = useState(entry?.on_task_list ?? !marker)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [retest, setRetest] = useState(String(entry?.retest_days ?? 2))
  const [after, setAfter] = useState<number | ''>('')
  const [afterAnswer, setAfterAnswer] = useState<Answer>('move_all')
  const [leads, setLeads] = useState<number | ''>('')
  const [leadsAnswer, setLeadsAnswer] = useState<Answer>('move_all')
  // D50 §2.6: an existing entry's "Add: comes after" / "Add: leads to" picks.
  const [linkAfter, setLinkAfter] = useState<number | ''>('')
  const [linkLeads, setLinkLeads] = useState<number | ''>('')
  const linkPick = entry ? linkChoices(template.steps, template.links, entry, (s) => s.day_offset) : null
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const others = template.steps.filter((s) => s.id !== entry?.id)
  const behavior = type?.behavior ?? entry?.behavior ?? null
  const showTemp = behavior === 'set_temp' || behavior === 'brew'
  // D56 §3.2: "Retest after [2] days" on a step whose type has a result.
  const hasResult = !marker && !!(type?.has_result ?? entry?.has_result)
  // D46 QA M1: a new Transfer/Filter goes into the next new tank, worked out
  // from its day; one being edited keeps its tank. Any other entry goes in a
  // tank that exists. D47 task 0 (N1): transfers stay in day order, so a day
  // before an existing transfer offers no tank and says why.
  const transfer = behavior === 'transfer'
  const dayNum = day === '' ? null : Number(day)
  // D56 §3.1: a pre-brew step is in the first tank with no phase.
  const preBrew = dayNum != null && dayNum < 0
  const intoTank = entry && transfer ? entry.vessel_index : newTankFor(template, dayNum ?? 0, entry?.id)
  const orderError = transfer ? transferOrderError(template, dayNum, entry) : null
  // D47: "Split - Filter", "Package - Partial": the fixed part of the name;
  // D49: "CIP - no sani", "Sanitize".
  const typeName = type?.name ?? entry?.type_name ?? 'Step'
  const fixedName =
    behavior === 'cip' && cipMethod !== 'sanitize_full'
      ? cipLabel(cipMethod)
      : behavior === 'split'
      ? `${typeName} - ${SPLIT_METHODS.find((m) => m.key === splitMethod)!.label}`
      : behavior === 'package' && packagePartial
        ? `${typeName} - Partial`
        : typeName
  const tankValue = transfer ? intoTank : vessel
  // Link pickers (QA minor 1): only steps a link to or from can reach.
  const afterChoices = onOrBefore(others, dayNum)
  const afterValue = after !== '' && afterChoices.some((s) => s.id === after) ? after : ''
  const leadsChoices = onOrAfter(others, dayNum).filter((s) => s.id !== afterValue)
  const leadsValue = leads !== '' && leadsChoices.some((s) => s.id === leads) ? leads : ''

  const pickType = (id: number | '') => {
    setTypeId(id)
    const t = types.find((x) => x.id === id)
    if (t) {
      setPhaseId(t.starts_phase_id ?? '')
      setOnTaskList(t.on_task_list)
      setSplitMethod('transfer')
      setPackagePartial(false)
      setCipMethod('sanitize_full')
    }
  }

  const save = async () => {
    const local: Record<string, string> = {}
    if (!marker && !entry && typeId === '') local.step_type_id = 'Pick a step type.'
    if (marker && phaseId === '') local.phase_id = 'Pick a phase.'
    if (day === '' || !Number.isInteger(Number(day)) || Number(day) < -30 || Number(day) > 365)
      local.day_offset = 'Pick a day from −30 to 365.'
    else if (preBrew) {
      const refused = notBeforeBrew(marker ? null : behavior, typeName)
      if (refused) local.day_offset = refused
    }
    if (behavior === 'set_temp' && temperature === '') local.temperature = 'Enter the temperature.'
    if (hasResult && retestDays(retest) == null) local.retest_days = 'Enter 1–30 days.'
    if (orderError) local.vessel_index = orderError
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    setError(null)
    const body: Record<string, unknown> = {
      day_offset: Number(day),
      vessel_index: preBrew ? 0 : tankValue,
      phase_id: phaseId === '' || preBrew ? null : phaseId,
      // D49 decision 6.1: a marker is never on the task list (the API refuses true).
      on_task_list: marker ? false : onTaskList,
      notes: notes.trim() || null,
    }
    if (!marker) body.detail = detail.trim() || null
    if (showTemp) body.temperature = temperature === '' ? null : Number(temperature)
    if (behavior === 'split') body.split_method = splitMethod
    if (behavior === 'package') body.package_partial = packagePartial
    if (behavior === 'cip') body.cip_method = cipMethod
    if (hasResult) body.retest_days = retestDays(retest)
    if (isBrew) {
      delete body.day_offset
      delete body.vessel_index
    }
    try {
      let res
      if (entry) {
        // D56 §3.5 (5210): the entry and what the link pickers hold in one
        // call; a refused link saves nothing, and the error names it.
        const links = pickedLinks(entry.id, linkAfter, linkLeads, linkPick!)
        if (links.length) body.links = links
        res = await api.patch<ApiResponse<Template>>(prodPath('templates', template.id, 'steps', entry.id), body)
      } else {
        if (!marker) body.step_type_id = typeId
        if (afterValue !== '') Object.assign(body, { comes_after_id: afterValue, comes_after_answer: afterAnswer })
        if (leadsValue !== '') Object.assign(body, { leads_to_id: leadsValue, leads_to_answer: leadsAnswer })
        res = await api.post<ApiResponse<Template>>(prodPath('templates', template.id, 'steps'), body)
      }
      onDone(res.data.data, entry ? 'Saved.' : marker ? 'Phase start added.' : `${type?.name ?? 'Step'} added.`)
    } catch (err) {
      const f = fieldErrors(err)
      setErrors(f)
      if (!Object.keys(f).length) setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  const title = entry ? `Edit ${entry.name}` : marker ? 'Add phase start' : 'Add step'

  return (
    <DialogShell title={title} testId="entry-dialog" error={error} busy={busy} onClose={onClose} onSave={save} saveLabel={entry ? 'Save' : 'Add'} closeLabel={entry ? 'Close' : 'Cancel'}>
      {!marker &&
        (entry ? (
          <Typography variant="body2" color="text.secondary">
            {entry.type_name}
            {entry.full_name ? ` · ${entry.full_name}` : ''}
          </Typography>
        ) : (
          <TextField
            select
            label="Step"
            value={typeId}
            autoFocus
            onChange={(e) => pickType(e.target.value === '' ? '' : Number(e.target.value))}
            error={!!errors.step_type_id}
            helperText={errors.step_type_id ?? type?.full_name}
            slotProps={selectTestId('entry-type')}
          >
            {typeChoices.map((t) => {
              // D56: before brew day only plain steps; the others say why.
              const refused = preBrew ? notBeforeBrew(t.behavior, t.name) : null
              return (
                <MenuItem key={t.id} value={t.id} disabled={!!refused} data-testid={`entry-type-${t.id}`} sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span>
                    {t.name}
                    {t.full_name ? ` (${t.full_name})` : ''}
                  </span>
                  {refused && (
                    <Typography variant="caption" color="text.secondary" data-testid={`entry-type-refused-${t.id}`}>
                      {refused}
                    </Typography>
                  )}
                </MenuItem>
              )
            })}
          </TextField>
        ))}
      {behavior === 'split' && (
        <TextField
          select
          label="How the parts leave"
          value={splitMethod}
          onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
          helperText="Every part that leaves the tank goes this way."
          slotProps={selectTestId('entry-split-method')}
        >
          {SPLIT_METHODS.map((m) => (
            <MenuItem key={m.key} value={m.key} data-testid={`entry-split-method-${m.key}`}>
              {m.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      {behavior === 'cip' && (
        <TextField
          select
          label="Process"
          value={cipMethod}
          onChange={(e) => setCipMethod(e.target.value as CipMethod)}
          helperText={CIP_METHODS.find((m) => m.key === cipMethod)!.hint}
          slotProps={selectTestId('entry-cip-method')}
        >
          {CIP_METHODS.map((m) => (
            <MenuItem key={m.key} value={m.key} data-testid={`entry-cip-method-${m.key}`}>
              {m.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      {behavior === 'package' && (
        <TextField
          select
          label="Package"
          value={packagePartial ? 'partial' : 'full'}
          onChange={(e) => setPackagePartial(e.target.value === 'partial')}
          helperText={packagePartial ? 'Packages some of the beer; the rest stays in the tank.' : 'Packages all of it and empties the tank.'}
          slotProps={selectTestId('entry-package')}
        >
          <MenuItem value="full" data-testid="entry-package-full">
            Full
          </MenuItem>
          <MenuItem value="partial" data-testid="entry-package-partial">
            Partial
          </MenuItem>
        </TextField>
      )}
      {!marker && (
        <TextField
          label={`Add to the name (“${fixedName}” stays)`}
          placeholder="e.g. #2"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          error={!!errors.detail}
          helperText={errors.detail}
          slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'entry-detail' } }}
        />
      )}
      {hasResult && (
        <TextField
          label="Retest after (days)"
          type="number"
          value={retest}
          onChange={(e) => setRetest(e.target.value)}
          error={!!errors.retest_days}
          helperText={errors.retest_days ?? 'A Fail can add a retest this many days later (1–30).'}
          slotProps={{ htmlInput: { min: 1, max: 30, 'data-testid': 'entry-retest-days' } }}
        />
      )}
      {showTemp && (
        <TextField
          label={behavior === 'brew' ? 'Starting temperature (°F, optional)' : 'Temperature (°F)'}
          type="number"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          error={!!errors.temperature}
          helperText={errors.temperature ?? '28–80°F'}
          slotProps={{ htmlInput: { min: 28, max: 80, 'data-testid': 'entry-temperature' } }}
        />
      )}
      <Box sx={grid2}>
        <TextField
          label="Day (0 = brew day)"
          type="number"
          value={day}
          disabled={isBrew}
          onChange={(e) => setDay(e.target.value)}
          error={!!errors.day_offset}
          helperText={
            errors.day_offset ??
            (isBrew ? 'Brew day stays on day 0 in the first tank.' : dayNum != null && Number.isInteger(dayNum) ? templateDayLabel(dayNum) : 'Before brew day: −1 to −30.')
          }
          slotProps={{ htmlInput: { min: -30, max: 365, 'data-testid': 'entry-day' }, formHelperText: { 'data-testid': 'entry-day-label' } as object }}
        />
        {preBrew && !marker ? (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }} data-testid="entry-pre-brew-note">
            Before brew day: in the first tank, with no phase.
          </Typography>
        ) : transfer && orderError ? (
          <TextField
            label="Into tank"
            value=""
            disabled
            error
            helperText={orderError}
            slotProps={{ htmlInput: { 'data-testid': 'entry-tank-order' }, formHelperText: { role: 'alert' } as object }}
          />
        ) : transfer ? (
          <TankPicker
            label="Into tank"
            choices={[intoTank]}
            value={intoTank}
            onChange={() => {}}
            helper={`Moves the beer out of ${vesselPhrase(intoTank - 1)} into a new tank.`}
            testId="entry-tank"
          />
        ) : (
          <TankPicker choices={tankChoices(template, vessel)} value={vessel} onChange={setVessel} disabled={isBrew} testId="entry-tank" />
        )}
      </Box>
      {!(preBrew && !marker) && (
      <TextField
        select
        label={marker ? 'Phase' : 'Starts a phase'}
        value={phaseId}
        onChange={(e) => setPhaseId(e.target.value === '' ? '' : Number(e.target.value))}
        error={!!errors.phase_id}
        helperText={errors.phase_id}
        slotProps={selectTestId('entry-phase')}
      >
        {!marker && <MenuItem value="">No phase</MenuItem>}
        {phaseChoices.map((p) => (
          <MenuItem key={p.id} value={p.id} data-testid={`entry-phase-${p.id}`}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      )}
      {!entry && (
        <>
          <Box sx={grid2}>
            <StepPicker label="Comes after" steps={afterChoices} value={afterValue} onChange={setAfter} testId="entry-after" />
            {afterValue !== '' && <AnswerPicker value={afterAnswer} onChange={setAfterAnswer} testId="entry-after-answer" />}
          </Box>
          {!marker && (
            <Box sx={grid2}>
              <StepPicker label="Leads to" steps={leadsChoices} value={leadsValue} onChange={setLeads} testId="entry-leads" />
              {leadsValue !== '' && <AnswerPicker value={leadsAnswer} onChange={setLeadsAnswer} testId="entry-leads-answer" />}
            </Box>
          )}
          <Typography variant="body2" color="text.secondary">
            Comes after: moving that step offers to move this one too.
            {!marker && ' Leads to: moving this step offers to move that one. Pick both to slot it into the chain between them.'}
          </Typography>
        </>
      )}
      {/* D49 decision 6.1: a phase marker never has a task; its switch stays off. */}
      {!marker && (
        <FormControlLabel
          control={<Switch checked={onTaskList} onChange={(e) => setOnTaskList(e.target.checked)} slotProps={{ input: { 'data-testid': 'entry-task-list' } as object }} />}
          label="Show on the Brewery task list"
        />
      )}
      {/* D50 §2.6: above Notes, so it isn't below the fold. */}
      {entry && linkPick && (
        <LinksEditor
          template={template}
          entry={entry}
          onDone={onDone}
          choices={linkPick}
          after={linkAfter}
          onAfter={setLinkAfter}
          leads={linkLeads}
          onLeads={setLinkLeads}
          busy={busy}
        />
      )}
      <TextField
        label="Notes (copied into every batch)"
        multiline
        minRows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000, 'data-testid': 'entry-notes' } }}
      />
    </DialogShell>
  )
}

/**
 * An entry's links in and out, each with its default answer; changes save at
 * once. The pickers' values are the dialog's (D50 §2.6: Save links them too);
 * they offer only what the server takes (`linkChoices`, QA minor 1).
 */
function LinksEditor({
  template,
  entry,
  onDone,
  choices,
  after: newAfter,
  onAfter: setNewAfter,
  leads: newLeads,
  onLeads: setNewLeads,
  busy: saving,
}: {
  template: Template
  entry: TemplateStep
  onDone: OnTemplate
  choices: { after: TemplateStep[]; leads: TemplateStep[] }
  after: number | ''
  onAfter: (id: number | '') => void
  leads: number | ''
  onLeads: (id: number | '') => void
  busy: boolean
}) {
  const byId = new Map(template.steps.map((s) => [s.id, s]))
  const [error, setError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const busy = linking || saving
  const [removing, setRemoving] = useState<(typeof template.links)[number] | null>(null)
  const afterChoices = choices.after
  const leadsChoices = choices.leads
  const afterValue = newAfter !== '' && afterChoices.some((s) => s.id === newAfter) ? newAfter : ''
  const leadsValue = newLeads !== '' && leadsChoices.some((s) => s.id === newLeads) ? newLeads : ''

  const call = async (fn: () => Promise<{ data: ApiResponse<Template> }>) => {
    setLinking(true)
    setError(null)
    try {
      const res = await fn()
      onDone(res.data.data)
      return true
    } catch (err) {
      setError(prodError(err))
      return false
    } finally {
      setLinking(false)
    }
  }

  const base = prodPath('templates', template.id, 'links')
  const add = async (from: number, to: number) => call(() => api.post(base, { from_step_id: from, to_step_id: to }))

  const list = (title: string, links: typeof template.links, other: (l: (typeof template.links)[number]) => number) => (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      {links.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nothing.
        </Typography>
      )}
      {links.map((l) => (
        <Box key={l.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }} data-testid={`link-row-${l.id}`}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            {byId.get(other(l)) ? stepLabel(byId.get(other(l))!) : '?'}
          </Typography>
          <TextField
            select
            size="small"
            value={l.default_answer}
            disabled={busy}
            onChange={(e) => call(() => api.patch(`${base}/${l.id}`, { default_answer: e.target.value }))}
            slotProps={selectTestId(`link-answer-${l.id}`)}
          >
            {ANSWERS.map((a) => (
              <MenuItem key={a.key} value={a.key} data-testid={`link-answer-${l.id}-${a.key}`}>
                {a.label}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="Remove link">
            <IconButton size="small" aria-label="Remove link" disabled={busy} onClick={() => setRemoving(l)} data-testid={`link-remove-${l.id}`}>
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ))}
    </Box>
  )

  return (
    <Box data-testid="links-editor" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Divider />
      <Typography variant="subtitle2">Links</Typography>
      <ErrorAlert error={error} testId="links-error" />
      {list('Comes after', template.links.filter((l) => l.to_step_id === entry.id), (l) => l.from_step_id)}
      {list('Leads to (“moves with it” = the step after follows when this one moves)', template.links.filter((l) => l.from_step_id === entry.id), (l) => l.to_step_id)}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <StepPicker label="Add: comes after" steps={afterChoices} value={afterValue} onChange={setNewAfter} testId="link-new-after" />
          <Button disabled={afterValue === '' || busy} onClick={async () => afterValue !== '' && (await add(afterValue, entry.id)) && setNewAfter('')} data-testid="link-new-after-add">
            Link
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <StepPicker label="Add: leads to" steps={leadsChoices} value={leadsValue} onChange={setNewLeads} testId="link-new-leads" />
          <Button disabled={leadsValue === '' || busy} onClick={async () => leadsValue !== '' && (await add(entry.id, leadsValue)) && setNewLeads('')} data-testid="link-new-leads-add">
            Link
          </Button>
        </Box>
      </Box>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const l = removing!
          setRemoving(null)
          await call(() => api.delete(`${base}/${l.id}`))
        }}
        title="Remove link"
        message={
          removing
            ? `Remove the link from ${byId.get(removing.from_step_id)?.name ?? '?'} to ${byId.get(removing.to_step_id)?.name ?? '?'}? Moving one will no longer offer to move the other.`
            : ''
        }
        confirmLabel="Remove"
        loading={busy}
      />
    </Box>
  )
}

/**
 * D46 §3.4 Add a ramp: one Set temp step per temperature, a day apart,
 * chained "moves with it"; the first starts the chosen phase (Crash).
 */
export function RampDialog({ template, phases, onClose, onDone }: { template: Template; phases: Phase[]; onClose: () => void; onDone: OnTemplate }) {
  const crash = phases.find((p) => !p.retired_at && p.name.toLowerCase() === 'crash')
  const [start, setStart] = useState('58')
  const [target, setTarget] = useState('32')
  const [change, setChange] = useState('10')
  const [firstDay, setFirstDay] = useState('')
  const [vessel, setVessel] = useState(0)
  const [phaseId, setPhaseId] = useState<number | ''>(crash?.id ?? '')
  const [after, setAfter] = useState<number | ''>('')
  const [afterAnswer, setAfterAnswer] = useState<Answer>('move_all')
  const [leads, setLeads] = useState<number | ''>('')
  const [leadsAnswer, setLeadsAnswer] = useState<Answer>('move_all')
  const [onTaskList, setOnTaskList] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // QA minor 5: the API's limits, before anything is listed.
  const plan = rampPlan(start, target, change)
  const temps = 'temps' in plan ? plan.temps : []
  const first = Number(firstDay)
  const lastDay = firstDay === '' ? null : first + Math.max(temps.length, 1) - 1
  const afterChoices = onOrBefore(template.steps, firstDay === '' ? null : first)
  const afterValue = after !== '' && afterChoices.some((s) => s.id === after) ? after : ''
  const leadsChoices = onOrAfter(template.steps, lastDay).filter((s) => s.id !== afterValue)
  const leadsValue = leads !== '' && leadsChoices.some((s) => s.id === leads) ? leads : ''

  const save = async () => {
    if ('error' in plan) return setError(plan.error)
    if (firstDay === '') return setError('Pick the first day.')
    setBusy(true)
    setError(null)
    const body: Record<string, unknown> = {
      start: Number(start),
      target: Number(target),
      change_per_day: Number(change),
      first_day: first,
      vessel_index: vessel,
      phase_id: phaseId === '' ? null : phaseId,
      on_task_list: onTaskList,
    }
    if (afterValue !== '') Object.assign(body, { comes_after_id: afterValue, comes_after_answer: afterAnswer })
    if (leadsValue !== '') Object.assign(body, { leads_to_id: leadsValue, leads_to_answer: leadsAnswer })
    try {
      const res = await api.post<ApiResponse<Template>>(prodPath('templates', template.id, 'ramp'), body)
      onDone(res.data.data, `Ramp added: ${temps.map((t) => `${t}°`).join(', ')}.`)
    } catch (err) {
      setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell title="Add a ramp" testId="ramp-dialog" error={error} busy={busy} onClose={onClose} onSave={save} saveLabel="Add ramp">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <TextField label="Start (°F)" type="number" value={start} onChange={(e) => setStart(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'ramp-start' } }} />
        <TextField label="Target (°F)" type="number" value={target} onChange={(e) => setTarget(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'ramp-target' } }} />
        <TextField
          label="Change per day (°F)"
          type="number"
          value={change}
          onChange={(e) => setChange(e.target.value)}
          helperText="5–10° is typical"
          // No native limits: the inline check says what's wrong (QA minor 5).
          slotProps={{ htmlInput: { 'data-testid': 'ramp-change' } }}
        />
      </Box>
      <Box sx={grid2}>
        <TextField label="First day (after brew day)" type="number" value={firstDay} onChange={(e) => setFirstDay(e.target.value)} slotProps={{ htmlInput: { min: 0, 'data-testid': 'ramp-first-day' } }} />
        <TankPicker choices={tankChoices(template, vessel)} value={vessel} onChange={setVessel} testId="ramp-tank" />
      </Box>
      <Typography
        variant="body2"
        data-testid="ramp-preview"
        role={'error' in plan ? 'alert' : undefined}
        color={'error' in plan ? 'error' : 'text.primary'}
      >
        {'error' in plan
          ? plan.error
          : `${temps.length} Set temp steps: ${temps.map((t) => `${t}°`).join(', ')}${firstDay !== '' ? ` on days ${first}–${first + temps.length - 1}` : ''}.`}
      </Typography>
      <TextField
        select
        label="The first step starts"
        value={phaseId}
        onChange={(e) => setPhaseId(e.target.value === '' ? '' : Number(e.target.value))}
        slotProps={selectTestId('ramp-phase')}
      >
        <MenuItem value="">No phase</MenuItem>
        {phases
          .filter((p) => !p.retired_at)
          .map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
      </TextField>
      <Box sx={grid2}>
        <StepPicker label="Comes after" steps={afterChoices} value={afterValue} onChange={setAfter} testId="ramp-after" />
        {afterValue !== '' && <AnswerPicker value={afterAnswer} onChange={setAfterAnswer} testId="ramp-after-answer" />}
      </Box>
      <Box sx={grid2}>
        <StepPicker
          label="Leads to"
          steps={leadsChoices}
          value={leadsValue}
          onChange={setLeads}
          testId="ramp-leads"
          helper="The ramp’s last step links to it."
        />
        {leadsValue !== '' && <AnswerPicker value={leadsAnswer} onChange={setLeadsAnswer} testId="ramp-leads-answer" />}
      </Box>
      <FormControlLabel
        control={<Switch checked={onTaskList} onChange={(e) => setOnTaskList(e.target.checked)} slotProps={{ input: { 'data-testid': 'ramp-task-list' } as object }} />}
        label="Show on the Brewery task list"
      />
    </DialogShell>
  )
}
