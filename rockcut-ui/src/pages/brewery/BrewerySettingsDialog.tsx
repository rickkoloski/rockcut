import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MenuItem, TextField, Typography } from '@mui/material'
import api from '../../lib/api'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { httpStatus } from '../../lib/notFound'
import {
  IBU_EQUATIONS,
  SETTING_GROUPS,
  draftOf,
  fieldText,
  isEquation,
  mergeDraft,
  parseField,
  readDraft,
  settingsError,
  type BrewerySettings,
  type BrewerySettingsReply,
  type Draft,
  type NumberField,
} from '../../lib/brewerySettings'
import { BREWERY_SETTINGS_KEY } from './brewerySettingsKey'

/**
 * D63 §6.2: edit the brewery's settings. As `ProductDialog`: full screen on a
 * phone, where back closes it, and Cancel or back drops what was typed. Only
 * the boxes that changed are sent. If someone saved first (409), what was
 * typed stays beside the current values, and Save can be pressed again.
 */
export default function BrewerySettingsDialog({ settings, onClose }: { settings: BrewerySettings; onClose: () => void }) {
  const qc = useQueryClient()
  // The values the boxes started from; a 409's current ones after it.
  const [base, setBase] = useState(settings)
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings))
  const [now, setNow] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const set = (key: string, text: string) => {
    setDraft((d) => ({ ...d, [key]: text }))
    setError(null)
  }

  const submit = async () => {
    const { changes, errors } = readDraft(draft, base)
    const refused = Object.values(errors)
    if (refused.length) return setError(refused.join(' '))
    if (Object.keys(changes).length === 0) return onClose()
    try {
      const { data } = await api.put<BrewerySettingsReply>('/api/brewery_settings', { ...changes, lock_version: base.lock_version })
      qc.setQueryData(BREWERY_SETTINGS_KEY, data)
      onClose()
    } catch (err) {
      const reply = (err as { response?: { data?: Partial<BrewerySettingsReply> } }).response?.data
      if (httpStatus(err) === 409 && reply?.data) {
        const merged = mergeDraft(draft, base, reply.data)
        setBase(reply.data)
        setDraft(merged.draft)
        setNow(merged.now)
        qc.setQueryData<BrewerySettingsReply>(BREWERY_SETTINGS_KEY, (r) => ({ can_manage: reply.can_manage ?? r?.can_manage ?? false, data: reply.data! }))
      }
      setError(settingsError(err))
    }
  }

  const refusal = (f: NumberField) => {
    if (draft[f.key].trim() === fieldText(f, base)) return null
    const parsed = parseField(f, draft[f.key])
    return parsed.ok ? null : parsed.error
  }

  return (
    <FormDialog open phone onClose={onClose} title="Edit settings" onSubmit={submit} error={error} testId="brewery-settings-dialog">
      {SETTING_GROUPS.map((g) => [
        <Typography key={g.testId} variant="subtitle1" component="h3" sx={{ mt: 1 }}>
          {g.testId === 'water' ? `${g.title}: ${base.source_water_name}` : g.title}
        </Typography>,
        ...g.fields.map((f) => {
          const current = now[f.key] ? `Now: ${now[f.key]}` : undefined
          const testId = `setting-input-${f.key}`
          if (isEquation(f)) {
            return (
              <TextField key={f.key} select label={f.label} value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)} helperText={current} data-testid={testId}>
                {IBU_EQUATIONS.map((e) => (
                  <MenuItem key={e.value} value={e.value}>
                    {e.label}
                  </MenuItem>
                ))}
              </TextField>
            )
          }
          const bad = refusal(f)
          return (
            <DecimalInput
              key={f.key}
              label={f.unit ? `${f.label} (${f.unit})` : f.label}
              value={draft[f.key]}
              onChange={(text) => set(f.key, text)}
              error={!!bad}
              helperText={bad ?? current}
              data-testid={testId}
            />
          )
        }),
      ])}
    </FormDialog>
  )
}
