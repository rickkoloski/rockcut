import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Chip, Collapse, IconButton, Link, Paper, Snackbar, TextField, Tooltip, Typography } from '@mui/material'
import { ContentCopy, ExpandLess, ExpandMore, RemoveCircleOutline, Restore } from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import type { ApiResponse } from '../../lib/types'
import { TEMPLATES_KEY, fieldErrors, prodError, prodPath, type Template, type TemplateSummary } from '../../lib/production'

const NO_TEMPLATES: TemplateSummary[] = []

export function IncompleteChip({ template }: { template: Pick<TemplateSummary, 'id' | 'issues'> }) {
  if (!template.issues.length) return null
  return (
    <Tooltip title={template.issues.map((i) => i.message).join(' ')}>
      <Chip
        size="small"
        variant="outlined"
        label="Incomplete"
        // ≥ 4.5:1 in both themes (D46 QA minor 6); MUI's warning orange is ~3:1 on light.
        sx={(theme) => {
          const c = theme.palette.mode === 'dark' ? '#ffb74d' : '#8a4b00'
          return { color: c, borderColor: c }
        }}
        data-testid={`template-incomplete-${template.id}`}
      />
    </Tooltip>
  )
}

/** Name and notes, for New and for Rename in the editor. */
export function TemplateNameDialog({
  template,
  onClose,
  onSaved,
}: {
  template: Pick<TemplateSummary, 'id' | 'name' | 'notes'> | null
  onClose: () => void
  onSaved: (t: Template) => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [notes, setNotes] = useState(template?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  usePhoneBackCloses(true, onClose)

  const save = async () => {
    if (!name.trim()) return setErrors({ name: 'Give the template a name.' })
    setBusy(true)
    try {
      const body = { name, notes: notes.trim() || null }
      const { data } = template
        ? await api.patch<ApiResponse<Template>>(prodPath('templates', template.id), body)
        : await api.post<ApiResponse<Template>>(prodPath('templates'), body)
      onSaved(data.data)
    } catch (err) {
      const f = fieldErrors(err)
      setErrors(f)
      if (!Object.keys(f).length) setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open onClose={onClose} title={template ? 'Rename template' : 'New template'} onSubmit={save} loading={busy} error={error} testId="template-name-dialog">
      <TextField
        label="Name"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        error={!!errors.name}
        helperText={errors.name}
        slotProps={{ htmlInput: { maxLength: 60, 'data-testid': 'template-name' }, formHelperText: { role: 'alert' } as object }}
      />
      <TextField
        label="Notes (optional)"
        multiline
        minRows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000, 'data-testid': 'template-notes' } }}
      />
      {!template && (
        <Typography variant="body2" color="text.secondary">
          It starts with Brew day on day 0. Add the rest in the editor.
        </Typography>
      )}
    </FormDialog>
  )
}

/**
 * D46 §3.4 Templates (`/brewery/production/templates`): every template with
 * its step count and an Incomplete badge, New, Duplicate, Retire, and a
 * Retired section with Restore. A name opens the editor.
 */
export default function TemplatesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: all = NO_TEMPLATES, isLoading } = useApiQuery<TemplateSummary[]>(TEMPLATES_KEY, prodPath('templates'))
  const active = all.filter((t) => !t.retired_at)
  const retired = all.filter((t) => t.retired_at)
  const [creating, setCreating] = useState(false)
  const [retiring, setRetiring] = useState<TemplateSummary | null>(null)
  const [showRetired, setShowRetired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY })

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

  const row = (t: TemplateSummary) => (
    <Paper key={t.id} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, mb: 0.75, flexWrap: 'wrap' }} data-testid={`template-row-${t.id}`}>
      <Box sx={{ flex: 1, minWidth: 180 }}>
        <Link component={RouterLink} to={`/brewery/production/templates/${t.id}`} sx={{ fontWeight: 600 }} data-testid={`template-link-${t.id}`}>
          {t.name}
        </Link>
        <Typography variant="body2" color="text.secondary">
          {t.step_count} {t.step_count === 1 ? 'step' : 'steps'}
          {t.notes ? ` · ${t.notes}` : ''}
        </Typography>
      </Box>
      <IncompleteChip template={t} />
      <Box sx={{ display: 'flex' }}>
        <Tooltip title="Duplicate">
          <IconButton
            size="small"
            aria-label={`Duplicate ${t.name}`}
            disabled={busy}
            onClick={() => act(() => api.post(prodPath('templates', t.id, 'duplicate')), `${t.name} duplicated.`)}
            data-testid={`template-duplicate-${t.id}`}
          >
            <ContentCopy fontSize="small" />
          </IconButton>
        </Tooltip>
        {t.retired_at ? (
          <Button size="small" startIcon={<Restore />} onClick={() => act(() => api.post(prodPath('templates', t.id, 'restore')), `${t.name} restored.`)} data-testid={`template-restore-${t.id}`}>
            Restore
          </Button>
        ) : (
          <Tooltip title="Retire">
            <IconButton size="small" aria-label={`Retire ${t.name}`} onClick={() => setRetiring(t)} data-testid={`template-retire-${t.id}`}>
              <RemoveCircleOutline fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Paper>
  )

  return (
    <Box>
      <PageHeader
        breadcrumbs={[{ label: 'Production', to: '/brewery/production' }, { label: 'Templates' }]}
        title="Templates"
        action={{ label: 'New template', onClick: () => setCreating(true), testId: 'template-new' }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A template describes a process once. Each batch gets its own copy, so editing a template never changes existing batches.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)} data-testid="templates-error">
          {error}
        </Alert>
      )}
      {isLoading ? (
        <Typography variant="body2">Loading…</Typography>
      ) : active.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="templates-empty">
          No templates yet.
        </Typography>
      ) : (
        <Box data-testid="templates-list">{active.map(row)}</Box>
      )}
      {retired.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Button size="small" onClick={() => setShowRetired((v) => !v)} endIcon={showRetired ? <ExpandLess /> : <ExpandMore />} data-testid="templates-retired-toggle">
            Retired ({retired.length})
          </Button>
          <Collapse in={showRetired}>
            <Box data-testid="templates-retired" sx={{ mt: 0.75 }}>
              {retired.map(row)}
            </Box>
          </Collapse>
        </Box>
      )}
      {creating && (
        <TemplateNameDialog
          template={null}
          onClose={() => setCreating(false)}
          onSaved={(t) => {
            refresh()
            navigate(`/brewery/production/templates/${t.id}`)
          }}
        />
      )}
      <ConfirmDialog
        open={!!retiring}
        onClose={() => setRetiring(null)}
        onConfirm={() => retiring && act(() => api.delete(prodPath('templates', retiring.id)), `${retiring.name} retired.`)}
        title="Retire template"
        message={retiring ? `Retire ${retiring.name}? It’s no longer offered for new batches. Batches already planned with it keep their steps.` : ''}
        confirmLabel="Retire"
        loading={busy}
      />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} data-testid="production-toast" />
    </Box>
  )
}
