import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Snackbar,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import { Add, DeleteOutline, Edit, NotesOutlined, Restore, ShowChart, Flag } from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import api from '../../lib/api'
import type { ApiResponse } from '../../lib/types'
import {
  PHASES_KEY,
  STEP_TYPES_KEY,
  TEMPLATES_KEY,
  linkSummary,
  prodError,
  prodPath,
  templateKey,
  vesselLabel,
  type Phase,
  type StepType,
  type Template,
  type TemplateStep,
} from '../../lib/production'
import { PhaseChip } from './ListsPage'
import { EntryDialog, RampDialog } from './EntryDialogs'
import TemplatePreview from './TemplatePreview'
import ErrorAlert from './ErrorAlert'
import { TemplateNameDialog } from './TemplatesPage'

const NO_PHASES: Phase[] = []
const NO_TYPES: StepType[] = []

type Editing = { kind: 'step' | 'marker'; entry: TemplateStep | null } | { kind: 'ramp' } | { kind: 'name' } | null

/**
 * D46 §3.4 the template editor (`/brewery/production/templates/:id`): name and
 * notes, what keeps it from being complete, its entries in day order, Add
 * step / Add phase start / Add a ramp, and a preview. Every change saves at
 * once and the page redraws from the template the API answers.
 */
export default function TemplateEditor() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { data: template, isLoading, error: loadError } = useApiQuery<Template>(templateKey(id), prodPath('templates', id))
  const { data: phases = NO_PHASES } = useApiQuery<Phase[]>(PHASES_KEY, prodPath('phases'))
  const { data: types = NO_TYPES } = useApiQuery<StepType[]>(STEP_TYPES_KEY, prodPath('step_types'))
  const [editing, setEditing] = useState<Editing>(null)
  const [removing, setRemoving] = useState<TemplateStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const phaseById = new Map(phases.map((p) => [p.id, p]))

  const show = (t: Template, message?: string) => {
    qc.setQueryData(templateKey(id), t)
    qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
    if (message) setToast(message)
  }

  const run = async (call: () => Promise<{ data: ApiResponse<Template> }>, message?: string) => {
    setBusy(true)
    try {
      const res = await call()
      setError(null)
      show(res.data.data, message)
    } catch (err) {
      setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <Typography variant="body2">Loading…</Typography>
  if (loadError || !template)
    return (
      <Alert severity="error" data-testid="template-load-error">
        {loadError ? prodError(loadError) : 'Template not found.'}
      </Alert>
    )

  const stepPath = (s: TemplateStep) => prodPath('templates', template.id, 'steps', s.id)
  const editingEntry = editing && (editing.kind === 'step' || editing.kind === 'marker') ? editing : null
  // The dialog shows the entry as it is now (links change while it's open).
  const liveEntry = editingEntry?.entry ? (template.steps.find((s) => s.id === editingEntry.entry!.id) ?? null) : null

  const row = (s: TemplateStep) => {
    const phase = s.phase_id ? phaseById.get(s.phase_id) : undefined
    const links = linkSummary(template, s)
    const brew = s.behavior === 'brew'
    return (
      <Paper
        key={s.id}
        variant="outlined"
        data-testid={`entry-row-${s.id}`}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '56px 1fr 120px', md: '64px minmax(160px, 1.4fr) 130px 120px 1.2fr 120px' },
          alignItems: 'center',
          columnGap: 1.5,
          rowGap: 0.5,
          px: 1.5,
          py: 1,
          mb: 0.75,
          bgcolor: s.marker ? 'action.hover' : undefined,
        }}
      >
        <Typography variant="body2" color="text.secondary" data-testid={`entry-day-${s.id}`}>
          Day {s.day_offset}
        </Typography>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: s.marker ? 400 : 600, fontStyle: s.marker ? 'italic' : 'normal' }} data-testid={`entry-name-${s.id}`}>
            {s.marker ? `${s.name} starts` : s.name}
            {s.notes && (
              <Tooltip title={s.notes}>
                <NotesOutlined fontSize="small" sx={{ ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} data-testid={`entry-notes-${s.id}`} />
              </Tooltip>
            )}
          </Typography>
          {s.full_name && (
            <Typography variant="caption" color="text.secondary">
              {s.full_name}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: { xs: 'none', md: 'block' } }} data-testid={`entry-phase-${s.id}`}>
          {phase && <PhaseChip phase={phase} />}
        </Box>
        <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }} data-testid={`entry-tank-${s.id}`}>
          {vesselLabel(s.vessel_index)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }} data-testid={`entry-links-${s.id}`}>
          {links.join('; ')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Tooltip title="Show on the Brewery task list">
            <Switch
              size="small"
              checked={s.on_task_list}
              disabled={busy}
              onChange={(e) => run(() => api.patch(stepPath(s), { on_task_list: e.target.checked }))}
              slotProps={{ input: { 'aria-label': `${s.name} on the task list`, 'data-testid': `entry-task-list-${s.id}` } as object }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ kind: s.marker ? 'marker' : 'step', entry: s })} data-testid={`entry-edit-${s.id}`}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
          {!brew && (
            <Tooltip title="Remove">
              <IconButton size="small" aria-label={`Remove ${s.name}`} onClick={() => setRemoving(s)} data-testid={`entry-remove-${s.id}`}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {/* Phone: the details under the name. */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, gridColumn: '2 / 4', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {phase && <PhaseChip phase={phase} />}
          <Typography variant="caption">{vesselLabel(s.vessel_index)}</Typography>
          {links.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {links.join('; ')}
            </Typography>
          )}
        </Box>
      </Paper>
    )
  }

  return (
    <Box>
      <PageHeader
        breadcrumbs={[{ label: 'Templates', to: '/brewery/production/templates' }, { label: template.name }]}
        title={template.name}
        toolbar={
          <>
            {template.retired_at && (
              <Button
                startIcon={<Restore />}
                onClick={() => run(() => api.post(prodPath('templates', template.id, 'restore')), `${template.name} restored.`)}
                data-testid="template-editor-restore"
              >
                Restore
              </Button>
            )}
            <Button startIcon={<Edit />} onClick={() => setEditing({ kind: 'name' })} data-testid="template-rename">
              Rename
            </Button>
          </>
        }
      />
      {template.retired_at && (
        <Chip label="Retired" size="small" sx={{ mb: 1 }} data-testid="template-retired-chip" />
      )}
      {template.notes && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, whiteSpace: 'pre-line' }} data-testid="template-notes-text">
          {template.notes}
        </Typography>
      )}
      {template.issues.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="template-issues">
          <AlertTitle>Incomplete: batches can’t be planned from it yet</AlertTitle>
          {template.issues.map((i) => (
            <div key={`${i.code}-${i.message}`} data-testid={`template-issue-${i.code}`}>
              {i.message}
            </div>
          ))}
        </Alert>
      )}
      <ErrorAlert error={error} onClose={() => setError(null)} sx={{ mb: 2 }} testId="template-error" />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Button variant="contained" startIcon={<Add />} onClick={() => setEditing({ kind: 'step', entry: null })} data-testid="template-add-step">
          Add step
        </Button>
        <Button variant="outlined" startIcon={<Flag />} onClick={() => setEditing({ kind: 'marker', entry: null })} data-testid="template-add-marker">
          Add phase start
        </Button>
        <Button variant="outlined" startIcon={<ShowChart />} onClick={() => setEditing({ kind: 'ramp' })} data-testid="template-add-ramp">
          Add a ramp
        </Button>
      </Box>
      <Box data-testid="template-entries">{template.steps.map(row)}</Box>

      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        Preview
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <TemplatePreview template={template} phases={phases} />
      </Paper>

      {editingEntry && (
        <EntryDialog
          template={template}
          types={types}
          phases={phases}
          kind={editingEntry.kind}
          entry={liveEntry}
          onClose={() => setEditing(null)}
          onDone={(t, message) => {
            show(t, message)
            // Adding or saving closes; a link change keeps the dialog open.
            if (message) setEditing(null)
          }}
        />
      )}
      {editing?.kind === 'ramp' && (
        <RampDialog
          template={template}
          phases={phases}
          onClose={() => setEditing(null)}
          onDone={(t, message) => {
            show(t, message)
            setEditing(null)
          }}
        />
      )}
      {editing?.kind === 'name' && (
        <TemplateNameDialog
          template={template}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            show(t, 'Saved.')
            setEditing(null)
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return
          const s = removing
          setRemoving(null)
          run(() => api.delete(stepPath(s)), `${s.name} removed.`)
        }}
        title="Remove from the template"
        message={
          removing
            ? `Remove ${removing.name}? The steps it linked stay linked through it.${removing.behavior === 'transfer' ? ' The CIP & Sanitize it added goes too.' : ''}`
            : ''
        }
        confirmLabel="Remove"
        loading={busy}
      />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} data-testid="production-toast" />
    </Box>
  )
}
