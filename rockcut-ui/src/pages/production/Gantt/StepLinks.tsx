import { useState } from 'react'
import { Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material'
import { Close } from '@mui/icons-material'
import ConfirmDialog from '../../../components/ConfirmDialog'
import { dayLabel } from '../../../lib/gantt'
import { prodPath, type Answer, type SchedBatch, type SchedLink, type SchedStep } from '../../../lib/production'
import { useFlows } from './flowsContext'

const ANSWERS: { key: Answer; label: string }[] = [
  { key: 'move_all', label: 'Moves with it by default' },
  { key: 'move_only', label: 'Stays by default' },
]

const selectTestId = (id: string) => ({ select: { SelectDisplayProps: { 'data-testid': id } as object } })

export interface LinkPicks {
  after: number | ''
  leads: number | ''
}

interface Props {
  step: SchedStep
  /** The step's batch and, when it's split, its parent and every part (a step links within its tree). */
  tree: SchedBatch[]
  /** The tree's links, once each. */
  links: SchedLink[]
  /** What the pickers offer (`linkChoices`: only what the API takes). */
  choices: { after: SchedStep[]; leads: SchedStep[] }
  picks: LinkPicks
  onPicks: (p: LinkPicks) => void
  busy: boolean
  onError: (message: string | null) => void
}

/**
 * D50 §2.7: a batch step's links, as the template editor has them: "Comes
 * after" and "Leads to", each with its default answer and Remove, and a
 * picker for each. The Link button links at once; the step dialog's Save
 * (or Close) links what the pickers still hold. Every change is a schedule
 * write (Undo; a staff code on the brewhouse device).
 */
export default function StepLinks({ step, tree, links, choices, picks, onPicks, busy, onError }: Props) {
  const flows = useFlows()
  const [working, setWorking] = useState(false)
  const [removing, setRemoving] = useState<SchedLink | null>(null)
  const steps = new Map(tree.flatMap((b) => b.steps.map((s) => [s.id, s] as const)))
  const batchOf = new Map(tree.flatMap((b) => b.steps.map((s) => [s.id, b] as const)))
  const split = tree.length > 1
  const label = (s: SchedStep | undefined) =>
    s ? `${s.name} · ${dayLabel(s.due_on)}${split ? ` · ${batchOf.get(s.id)?.label ?? ''}` : ''}` : '?'
  const disabled = busy || working

  const write = async (call: Parameters<typeof flows.write>[0], message: string) => {
    setWorking(true)
    onError(null)
    const r = await flows.write(call, message)
    setWorking(false)
    if (!r.ok) onError(r.error || null)
    return r.ok
  }

  const link = async (which: 'after' | 'leads') => {
    const id = picks[which]
    if (id === '') return
    const body = which === 'after' ? { comes_after_id: id } : { leads_to_id: id }
    const text = which === 'after' ? `${steps.get(id)?.name ?? 'It'} → ${step.name}` : `${step.name} → ${steps.get(id)?.name ?? 'it'}`
    if (await write((a) => a.post(prodPath('steps', step.id, 'links'), body), `Linked: ${text}.`)) onPicks({ ...picks, [which]: '' })
  }

  const list = (title: string, rows: SchedLink[], other: (l: SchedLink) => number, testId: string) => (
    <Box data-testid={testId}>
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      {rows.length === 0 && <Typography variant="body2">Nothing</Typography>}
      {rows.map((l) => (
        <Box key={l.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }} data-testid={`step-link-row-${l.id}`}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
            {label(steps.get(other(l)))}
          </Typography>
          <TextField
            select
            size="small"
            value={l.default_answer}
            disabled={disabled}
            onChange={(e) => write((a) => a.patch(prodPath('step_links', l.id), { default_answer: e.target.value }), 'Saved.')}
            slotProps={selectTestId(`step-link-answer-${l.id}`)}
          >
            {ANSWERS.map((a) => (
              <MenuItem key={a.key} value={a.key} data-testid={`step-link-answer-${l.id}-${a.key}`}>
                {a.label}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="Remove link">
            <span>
              <IconButton size="small" aria-label="Remove link" disabled={disabled} onClick={() => setRemoving(l)} data-testid={`step-link-remove-${l.id}`}>
                <Close fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      ))}
    </Box>
  )

  const picker = (which: 'after' | 'leads', title: string, options: SchedStep[]) => (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TextField
        select
        fullWidth
        size="small"
        label={title}
        value={picks[which]}
        disabled={disabled}
        onChange={(e) => onPicks({ ...picks, [which]: e.target.value === '' ? '' : Number(e.target.value) })}
        slotProps={selectTestId(`step-link-new-${which}`)}
      >
        <MenuItem value="">Nothing</MenuItem>
        {options.map((s) => (
          <MenuItem key={s.id} value={s.id} data-testid={`step-link-new-${which}-${s.id}`}>
            {label(s)}
          </MenuItem>
        ))}
      </TextField>
      <Button disabled={picks[which] === '' || disabled} onClick={() => link(which)} data-testid={`step-link-new-${which}-add`}>
        Link
      </Button>
    </Box>
  )

  return (
    <Box data-testid="step-dialog-links" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2">Links</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        {list('Comes after', links.filter((l) => l.to_step_id === step.id), (l) => l.from_step_id, 'step-links-after')}
        {list('Leads to', links.filter((l) => l.from_step_id === step.id), (l) => l.to_step_id, 'step-links-leads')}
      </Box>
      {picker('after', 'Add: comes after', choices.after)}
      {picker('leads', 'Add: leads to', choices.leads)}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const l = removing!
          setRemoving(null)
          await write((a) => a.delete(prodPath('step_links', l.id)), 'Link removed.')
        }}
        title="Remove link"
        message={
          removing
            ? `Remove the link from ${steps.get(removing.from_step_id)?.name ?? '?'} to ${steps.get(removing.to_step_id)?.name ?? '?'}? Moving one will no longer offer to move the other.`
            : ''
        }
        confirmLabel="Remove"
        loading={disabled}
      />
    </Box>
  )
}
