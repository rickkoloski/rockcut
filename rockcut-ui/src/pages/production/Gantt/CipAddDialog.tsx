import { useState } from 'react'
import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Switch } from '@mui/material'
import FormDialog from '../../../components/FormDialog'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import api from '../../../lib/api'
import { dayLabel } from '../../../lib/gantt'
import { CIP_METHODS, prodPath, type CipMethod, type Tank } from '../../../lib/production'
import TankSelect from './TankSelect'
import { useFlows } from './flowsContext'
import DateField from '../DateField'

/**
 * D47 §3.10 Add CIP & Sanitize: tank, date, and "Already done" (records it
 * instead of adding a task). D49 §3.12a: Add CIP…, with the variant: CIP &
 * Sanitize, CIP - no sani or Sanitize.
 */
export default function CipAddDialog({ tanks, initialTankId, initialDay, today, onClose }: { tanks: Tank[]; initialTankId: number | null; initialDay: string; today: string; onClose: () => void }) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const [tankId, setTankId] = useState<number | null>(initialTankId)
  const [day, setDay] = useState(initialDay)
  const [done, setDone] = useState(false)
  const [method, setMethod] = useState<CipMethod>('sanitize_full')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!tankId) return setError('Pick the tank.')
    if (!day) return setError('Pick the day.')
    if (done && day > today) return setError('A CIP done in the future? Pick today or earlier.')
    setBusy(true)
    const tank = tanks.find((t) => t.id === tankId)?.name ?? 'the tank'
    const name = CIP_METHODS.find((m) => m.key === method)!.label
    const r = await flows.write(
      () => api.post(prodPath('cips'), { tank_id: tankId, due_on: day, already_done: done, cip_method: method }),
      done ? `${name} recorded in ${tank}.` : `${name} added in ${tank} on ${dayLabel(day)}.`,
    )
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  return (
    <FormDialog open onClose={onClose} title="Add CIP" onSubmit={save} loading={busy} error={error} testId="cip-add-dialog">
      <FormControl>
        <FormLabel id="cip-method-label">Process</FormLabel>
        <RadioGroup aria-labelledby="cip-method-label" value={method} onChange={(e) => setMethod(e.target.value as CipMethod)} data-testid="cip-method">
          {CIP_METHODS.map((m) => (
            <FormControlLabel key={m.key} value={m.key} control={<Radio slotProps={{ input: { 'data-testid': `cip-method-${m.key}` } as object }} />} label={m.label} />
          ))}
        </RadioGroup>
      </FormControl>
      <TankSelect label="Tank" tanks={tanks} value={tankId} onChange={setTankId} testId="cip-tank" />
      <DateField
        label="Day"
        value={day}
        onCommit={setDay}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'cip-day' } }}
      />
      <FormControlLabel
        control={<Switch checked={done} onChange={(e) => setDone(e.target.checked)} slotProps={{ input: { 'data-testid': 'cip-done' } as object }} />}
        label="Already done (records it instead of adding a task)"
      />
    </FormDialog>
  )
}
