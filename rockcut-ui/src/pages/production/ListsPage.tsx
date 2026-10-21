import { useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import { Add, Check, Edit, ExpandLess, ExpandMore, RemoveCircleOutline, Restore } from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import {
  BEHAVIOR_LABELS,
  PHASES_KEY,
  PHASE_PALETTE,
  STEP_TYPES_KEY,
  TEMPLATES_KEY,
  fieldErrors,
  phaseFill,
  prodError,
  prodPath,
  type Mode,
  type Phase,
  type StepType,
} from '../../lib/production'
import OrderedList from './OrderedList'

const NO_PHASES: Phase[] = []
const NO_TYPES: StepType[] = []

/** A phase's name on its color. */
export function PhaseChip({ phase, size = 'small' }: { phase: Pick<Phase, 'name' | 'color'>; size?: 'small' | 'medium' }) {
  const mode = useTheme().palette.mode as Mode
  const { bg, fg } = phaseFill(phase.color, mode)
  return <Chip size={size} label={phase.name} sx={{ bgcolor: bg, color: fg, fontWeight: 600 }} />
}

/** The 12 swatches; the chosen one is ringed and ticked. */
function Swatches({ value, onChange }: { value: string; onChange: (token: string) => void }) {
  const mode = useTheme().palette.mode as Mode
  return (
    <Box role="radiogroup" aria-label="Color" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="phase-swatches">
      {PHASE_PALETTE.map((c) => {
        const { bg, fg } = phaseFill(c.token, mode)
        const on = c.token === value
        return (
          <Tooltip key={c.token} title={c.label}>
            <Box
              component="button"
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.label}
              onClick={() => onChange(c.token)}
              data-testid={`phase-swatch-${c.token}`}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: bg,
                color: fg,
                cursor: 'pointer',
                border: 2,
                borderColor: on ? 'text.primary' : 'divider',
                outlineOffset: 2,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {on && <Check fontSize="small" />}
            </Box>
          </Tooltip>
        )
      })}
    </Box>
  )
}

function PhaseDialog({ phase, used, onClose, onSaved }: { phase: Phase | null; used: string[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(phase?.name ?? '')
  // Until one is picked: the first color no active phase has (`used` may still be loading).
  const [picked, setColor] = useState<string | null>(phase?.color ?? null)
  const color = picked ?? PHASE_PALETTE.find((c) => !used.includes(c.token))?.token ?? 'slate'
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  usePhoneBackCloses(true, onClose)

  const save = async () => {
    if (!name.trim()) return setErrors({ name: 'Give the phase a name.' })
    setBusy(true)
    try {
      if (phase) await api.patch(prodPath('phases', phase.id), { name, color })
      else await api.post(prodPath('phases'), { name, color })
      onSaved(phase ? `${name.trim()} saved.` : `${name.trim()} added.`)
    } catch (err) {
      const f = fieldErrors(err)
      setErrors(f)
      if (!Object.keys(f).length) setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open onClose={onClose} title={phase ? `Edit ${phase.name}` : 'Add phase'} onSubmit={save} loading={busy} error={error} testId="phase-dialog">
      <TextField
        label="Name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        error={!!errors.name}
        helperText={errors.name}
        slotProps={{ htmlInput: { maxLength: 30, 'data-testid': 'phase-name' }, formHelperText: { role: 'alert' } as object }}
      />
      <Typography variant="subtitle2">Color</Typography>
      <Swatches value={color} onChange={setColor} />
      <Box>
        <PhaseChip phase={{ name: name || 'Preview', color }} size="medium" />
      </Box>
    </FormDialog>
  )
}

function StepTypeDialog({
  type,
  phases,
  onClose,
  onSaved,
}: {
  type: StepType | null
  phases: Phase[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [name, setName] = useState(type?.name ?? '')
  const [fullName, setFullName] = useState(type?.full_name ?? '')
  const [startsPhase, setStartsPhase] = useState<number | ''>(type?.starts_phase_id ?? '')
  const [onTaskList, setOnTaskList] = useState(type?.on_task_list ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  usePhoneBackCloses(true, onClose)
  // A retired phase stays listed while it's the one chosen.
  const choices = phases.filter((p) => !p.retired_at || p.id === startsPhase)

  const save = async () => {
    if (!name.trim()) return setErrors({ name: 'Give the step type a name.' })
    setBusy(true)
    const body = { name, full_name: fullName, starts_phase_id: startsPhase === '' ? null : startsPhase, on_task_list: onTaskList }
    try {
      if (type) await api.patch(prodPath('step_types', type.id), body)
      else await api.post(prodPath('step_types'), body)
      onSaved(type ? `${name.trim()} saved.` : `${name.trim()} added.`)
    } catch (err) {
      const f = fieldErrors(err)
      setErrors(f)
      if (!Object.keys(f).length) setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open onClose={onClose} title={type ? `Edit ${type.name}` : 'Add step type'} onSubmit={save} loading={busy} error={error} testId="step-type-dialog">
      {type?.built_in && (
        <Alert severity="info" data-testid="step-type-built-in">
          Built in: {BEHAVIOR_LABELS[type.behavior].toLowerCase()}. You can rename it, but not retire it.
        </Alert>
      )}
      <TextField
        label="Name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        error={!!errors.name}
        helperText={errors.name ?? 'Every step of this type starts with this name.'}
        slotProps={{ htmlInput: { maxLength: 30, 'data-testid': 'step-type-name' }, formHelperText: { role: errors.name ? 'alert' : undefined } as object }}
      />
      <TextField
        label="Full name (optional)"
        placeholder="e.g. Primary Dry Hop"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 60, 'data-testid': 'step-type-full-name' } }}
      />
      <TextField
        select
        label="Starts a phase"
        value={startsPhase}
        onChange={(e) => setStartsPhase(e.target.value === '' ? '' : Number(e.target.value))}
        error={!!errors.starts_phase_id}
        helperText={errors.starts_phase_id ?? 'The phase a new step of this type starts, unless changed in the template.'}
        slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'step-type-phase' } as object } }}
      >
        <MenuItem value="">No phase</MenuItem>
        {choices.map((p) => (
          <MenuItem key={p.id} value={p.id}>
            {p.name}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={<Switch checked={onTaskList} onChange={(e) => setOnTaskList(e.target.checked)} slotProps={{ input: { 'data-testid': 'step-type-task-list' } as object }} />}
        label="On the Brewery task list by default"
      />
    </FormDialog>
  )
}

function RetiredSection<T extends { id: number; name: string }>({
  items,
  testId,
  onRestore,
  render,
}: {
  items: T[]
  testId: string
  onRestore: (item: T) => void
  render?: (item: T) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <Box sx={{ mt: 1 }}>
      <Button size="small" onClick={() => setOpen((v) => !v)} endIcon={open ? <ExpandLess /> : <ExpandMore />} data-testid={`${testId}-retired-toggle`}>
        Retired ({items.length})
      </Button>
      <Collapse in={open}>
        {items.map((item) => (
          <Paper key={item.id} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.75, mt: 0.75 }} data-testid={`${testId}-retired-row-${item.id}`}>
            <Box sx={{ flex: 1, color: 'text.secondary' }}>{render ? render(item) : item.name}</Box>
            <Button size="small" startIcon={<Restore />} onClick={() => onRestore(item)} data-testid={`${testId}-restore-${item.id}`}>
              Restore
            </Button>
          </Paper>
        ))}
      </Collapse>
    </Box>
  )
}

/**
 * D46 §3.3 Phases & steps (`/brewery/production/lists`): two lists with Add,
 * Edit (rename, color, full name, starting phase, task list), reorder and
 * retire/restore. Built-in step types have no Retire. Retiring hides one
 * from the pickers; templates keep it.
 */
export default function ListsPage() {
  const qc = useQueryClient()
  const { data: phases = NO_PHASES } = useApiQuery<Phase[]>(PHASES_KEY, prodPath('phases'))
  const { data: types = NO_TYPES } = useApiQuery<StepType[]>(STEP_TYPES_KEY, prodPath('step_types'))
  const activePhases = phases.filter((p) => !p.retired_at)
  const activeTypes = types.filter((t) => !t.retired_at)
  const phaseById = new Map(phases.map((p) => [p.id, p]))
  const [editPhase, setEditPhase] = useState<Phase | 'new' | null>(null)
  const [editType, setEditType] = useState<StepType | 'new' | null>(null)
  const [retiring, setRetiring] = useState<{ kind: 'phases' | 'step_types'; item: Phase | StepType } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: PHASES_KEY })
    qc.invalidateQueries({ queryKey: STEP_TYPES_KEY })
    qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
  }

  const saved = (message: string) => {
    setEditPhase(null)
    setEditType(null)
    setToast(message)
    refresh()
  }

  const act = async (call: () => Promise<unknown>, message: string) => {
    setBusy(true)
    try {
      await call()
      setError(null)
      setToast(message)
    } catch (err) {
      setError(prodError(err))
    } finally {
      setBusy(false)
      setRetiring(null)
      refresh()
    }
  }

  const actions = (kind: 'phases' | 'step_types', item: Phase | StepType, onEdit: () => void, canRetire: boolean) => (
    <Box sx={{ display: 'flex' }}>
      <Tooltip title="Edit">
        <IconButton size="small" aria-label={`Edit ${item.name}`} onClick={onEdit} data-testid={`${kind}-edit-${item.id}`}>
          <Edit fontSize="small" />
        </IconButton>
      </Tooltip>
      {canRetire && (
        <Tooltip title="Retire">
          <IconButton size="small" aria-label={`Retire ${item.name}`} onClick={() => setRetiring({ kind, item })} data-testid={`${kind}-retire-${item.id}`}>
            <RemoveCircleOutline fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  )

  return (
    <Box>
      <PageHeader breadcrumbs={[{ label: 'Production', to: '/brewery/production' }, { label: 'Phases & steps' }]} title="Phases & steps" />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)} data-testid="lists-error">
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, alignItems: 'start' }}>
        <Box data-testid="phases-section">
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              Phases
            </Typography>
            <Button startIcon={<Add />} onClick={() => setEditPhase('new')} data-testid="phase-add">
              Add phase
            </Button>
          </Box>
          <OrderedList
            items={activePhases}
            testId="phases"
            label={(p) => p.name}
            onReorder={(ids) => api.post(prodPath('phases', 'reorder'), { ids }).finally(refresh)}
            render={(p) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1 }} data-testid={`phases-name-${p.id}`}>
                  <PhaseChip phase={p} />
                </Box>
                {actions('phases', p, () => setEditPhase(p), true)}
              </Box>
            )}
          />
          <RetiredSection items={phases.filter((p) => p.retired_at)} testId="phases" onRestore={(p) => act(() => api.post(prodPath('phases', p.id, 'restore')), `${p.name} restored.`)} />
        </Box>

        <Box data-testid="step-types-section">
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              Step types
            </Typography>
            <Button startIcon={<Add />} onClick={() => setEditType('new')} data-testid="step-type-add">
              Add step type
            </Button>
          </Box>
          <OrderedList
            items={activeTypes}
            testId="step_types"
            label={(t) => t.name}
            onReorder={(ids) => api.post(prodPath('step_types', 'reorder'), { ids }).finally(refresh)}
            render={(t) => {
              const starts = t.starts_phase_id ? phaseById.get(t.starts_phase_id) : undefined
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 140 }}>
                    <Typography sx={{ fontWeight: 600 }} data-testid={`step_types-name-${t.id}`}>
                      {t.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[t.full_name, t.built_in ? `Built in · ${BEHAVIOR_LABELS[t.behavior]}` : null, t.on_task_list ? null : 'Not on the task list']
                        .filter(Boolean)
                        .join(' · ')}
                    </Typography>
                  </Box>
                  {starts && <PhaseChip phase={starts} />}
                  {actions('step_types', t, () => setEditType(t), !t.built_in)}
                </Box>
              )
            }}
          />
          <RetiredSection
            items={types.filter((t) => t.retired_at)}
            testId="step_types"
            onRestore={(t) => act(() => api.post(prodPath('step_types', t.id, 'restore')), `${t.name} restored.`)}
          />
        </Box>
      </Box>

      {editPhase && <PhaseDialog phase={editPhase === 'new' ? null : editPhase} used={activePhases.map((p) => p.color)} onClose={() => setEditPhase(null)} onSaved={saved} />}
      {editType && <StepTypeDialog type={editType === 'new' ? null : editType} phases={phases} onClose={() => setEditType(null)} onSaved={saved} />}
      <ConfirmDialog
        open={!!retiring}
        onClose={() => setRetiring(null)}
        onConfirm={() =>
          retiring && act(() => api.delete(prodPath(retiring.kind, retiring.item.id)), `${retiring.item.name} retired.`)
        }
        title={retiring?.kind === 'phases' ? 'Retire phase' : 'Retire step type'}
        message={retiring ? `Retire ${retiring.item.name}? It leaves the pickers. Templates that use it keep it.` : ''}
        confirmLabel="Retire"
        loading={busy}
      />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} data-testid="production-toast" />
    </Box>
  )
}
