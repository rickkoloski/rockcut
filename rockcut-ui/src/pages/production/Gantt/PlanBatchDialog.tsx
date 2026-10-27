import { useRef, useState } from 'react'
import { FormControlLabel, MenuItem, Radio, RadioGroup, Switch, TextField, Typography } from '@mui/material'
import FormDialog from '../../../components/FormDialog'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import { useApiQuery } from '../../../hooks/useApiQuery'
import api from '../../../lib/api'
import { addDaysKey } from '../../../lib/datetime'
import { fieldErrors, prodPath, templateKey, TEMPLATES_KEY, vesselLabel, type Tank, type Template, type TemplateSummary } from '../../../lib/production'
import type { Brand } from '../../../lib/types'
import TankSelect from './TankSelect'
import { useFlows } from './flowsContext'
import { useRefusal } from '../../../hooks/useRefusal'

interface Props {
  tanks: Tank[]
  /** From the row and day tapped. */
  initialTankId?: number | null
  initialDay: string
  onClose: () => void
}

/**
 * D47 §3.5 Plan batch: brand, template, brew day, volume, "Brew over two
 * days", the first tank and a "Transfer to" tank for each later one (any may
 * be Unassigned). The new batch gets a P-number. D49 §3.12b: or Pencil in
 * (an X-number; not committed yet).
 */
export default function PlanBatchDialog({ tanks, initialTankId = null, initialDay, onClose }: Props) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const brands = useApiQuery<Brand[]>(['brands'], '/api/brands').data ?? []
  const templates = (useApiQuery<TemplateSummary[]>(TEMPLATES_KEY, prodPath('templates')).data ?? []).filter((t) => !t.retired_at)
  const [brandId, setBrandId] = useState<number | ''>('')
  const [templateId, setTemplateId] = useState<number | ''>('')
  const [brewOn, setBrewOn] = useState(initialDay)
  const [volume, setVolume] = useState('')
  const [twoDays, setTwoDays] = useState(false)
  const [pencilled, setPencilled] = useState(false)
  const [tankIds, setTankIds] = useState<(number | null)[]>([initialTankId])
  const [errors, setErrors] = useState<Record<string, string>>({})
  // A refusal clears when anything picked changes (DEV QA R2).
  const [error, setError] = useRefusal([brandId, templateId, brewOn, volume, twoDays, tankIds])
  const [busy, setBusy] = useState(false)
  // Enter and a click on Save in the same moment would both submit before
  // `busy` disables the button (QA: two "planned" snackbars once).
  const saving = useRef(false)
  const template = useApiQuery<Template>(templateKey(templateId || 0), prodPath('templates', templateId || 0), undefined, { enabled: templateId !== '' }).data
  const vessels = template && template.id === templateId ? Math.max(0, ...template.steps.map((s) => s.vessel_index)) + 1 : 1
  // A rough span for the out-of-service hints: the brew day to the template's last day.
  const lastDay = template ? Math.max(0, ...template.steps.map((s) => s.day_offset)) : 30
  const activeBrands = brands.filter((b) => b.status !== 'retired').sort((a, b) => a.name.localeCompare(b.name))

  const setTank = (k: number, id: number | null) => setTankIds((ids) => Array.from({ length: Math.max(ids.length, k + 1) }, (_, i) => (i === k ? id : (ids[i] ?? null))))

  const save = async () => {
    const local: Record<string, string> = {}
    if (brandId === '') local.brand_id = 'Pick a brand.'
    if (templateId === '') local.template_id = 'Pick a template.'
    if (!brewOn) local.brew_on = 'Pick the brew day.'
    if (!(Number(volume) > 0 && Number(volume) < 10000)) local.volume_bbl = 'Enter a volume more than 0 and under 10,000 bbl.'
    setErrors(local)
    if (Object.keys(local).length || saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    const r = await flows.write<{ batches: { label: string }[] }>(
      () =>
        api.post(prodPath('batches'), {
          brand_id: brandId,
          template_id: templateId,
          brew_on: brewOn,
          volume_bbl: Number(volume),
          brew_two_days: twoDays,
          tank_ids: Array.from({ length: vessels }, (_, k) => tankIds[k] ?? null),
          pencilled,
        }),
      (d) => `${d.batches[0]?.label ?? 'The batch'} ${pencilled ? 'pencilled in' : 'planned'}.`,
    )
    saving.current = false
    setBusy(false)
    if (r.ok) return onClose()
    const f = fieldErrors({ response: { data: r.body } })
    setErrors(f)
    if (!Object.keys(f).length) setError(r.error)
  }

  const incomplete = templates.filter((t) => t.issues.length)

  return (
    <FormDialog open onClose={onClose} title="Plan batch" onSubmit={save} loading={busy} error={error} testId="plan-dialog" cancelLabel="Cancel">
      <RadioGroup row value={pencilled ? 'pencil' : 'schedule'} onChange={(e) => setPencilled(e.target.value === 'pencil')} aria-label="Schedule or pencil in">
        <FormControlLabel value="schedule" control={<Radio slotProps={{ input: { 'data-testid': 'plan-schedule' } as object }} />} label="Schedule" />
        <FormControlLabel value="pencil" control={<Radio slotProps={{ input: { 'data-testid': 'plan-pencil' } as object }} />} label="Pencil in" />
      </RadioGroup>
      {pencilled && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
          Shows where it fits without giving anyone tasks. It gets an X-number until it’s scheduled.
        </Typography>
      )}
      <TextField
        select
        label="Brand"
        value={brandId}
        onChange={(e) => setBrandId(Number(e.target.value))}
        error={!!errors.brand_id}
        helperText={errors.brand_id}
        slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'plan-brand' } as object } }}
      >
        {activeBrands.map((b) => (
          <MenuItem key={b.id} value={b.id} data-testid={`plan-brand-${b.id}`}>
            {b.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Template"
        value={templateId}
        onChange={(e) => setTemplateId(Number(e.target.value))}
        error={!!errors.template_id}
        helperText={errors.template_id ?? (incomplete.length ? 'Incomplete templates can’t be planned yet.' : undefined)}
        slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'plan-template' } as object } }}
      >
        {templates.map((t) => (
          <MenuItem key={t.id} value={t.id} disabled={t.issues.length > 0} data-testid={`plan-template-${t.id}`}>
            {t.name}
            {t.issues.length ? ' (incomplete)' : ''}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="date"
        label="Brew day"
        value={brewOn}
        onChange={(e) => setBrewOn(e.target.value)}
        error={!!errors.brew_on}
        helperText={errors.brew_on}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'plan-brew-on' } }}
      />
      <TextField
        type="number"
        label="Volume (bbl)"
        value={volume}
        onChange={(e) => setVolume(e.target.value)}
        error={!!errors.volume_bbl}
        helperText={errors.volume_bbl}
        slotProps={{ htmlInput: { min: 0, step: 'any', 'data-testid': 'plan-volume' } }}
      />
      <FormControlLabel
        control={<Switch checked={twoDays} onChange={(e) => setTwoDays(e.target.checked)} slotProps={{ input: { 'data-testid': 'plan-two-days' } as object }} />}
        label="Brew over two days"
      />
      {Array.from({ length: vessels }, (_, k) => (
        <TankSelect
          key={k}
          label={k === 0 ? 'Ferment in' : `Transfer to (${vesselLabel(k).toLowerCase()})`}
          tanks={tanks}
          value={tankIds[k] ?? null}
          onChange={(id) => setTank(k, id)}
          from={brewOn}
          to={brewOn ? addDaysKey(brewOn, lastDay) : undefined}
          testId={`plan-tank-${k}`}
        />
      ))}
      {templateId === '' && (
        <Typography variant="body2" color="text.secondary">
          Pick a template to choose the tanks after a transfer.
        </Typography>
      )}
    </FormDialog>
  )
}
