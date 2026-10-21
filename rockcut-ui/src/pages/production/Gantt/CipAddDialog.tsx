import { useState } from 'react'
import { FormControlLabel, Switch, TextField } from '@mui/material'
import FormDialog from '../../../components/FormDialog'
import { usePhoneBackCloses } from '../../../hooks/useBackCloses'
import api from '../../../lib/api'
import { dayLabel } from '../../../lib/gantt'
import { prodPath, type Tank } from '../../../lib/production'
import TankSelect from './TankSelect'
import { useFlows } from './flowsContext'

/**
 * D47 §3.10 Add CIP & Sanitize: tank, date, and "Already done" (records it
 * instead of adding a task).
 */
export default function CipAddDialog({ tanks, initialTankId, initialDay, today, onClose }: { tanks: Tank[]; initialTankId: number | null; initialDay: string; today: string; onClose: () => void }) {
  const flows = useFlows()
  usePhoneBackCloses(true, onClose)
  const [tankId, setTankId] = useState<number | null>(initialTankId)
  const [day, setDay] = useState(initialDay)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!tankId) return setError('Pick the tank.')
    if (!day) return setError('Pick the day.')
    if (done && day > today) return setError('A CIP done in the future? Pick today or earlier.')
    setBusy(true)
    const tank = tanks.find((t) => t.id === tankId)?.name ?? 'the tank'
    const r = await flows.write(
      () => api.post(prodPath('cips'), { tank_id: tankId, due_on: day, already_done: done }),
      done ? `CIP & Sanitize recorded in ${tank}.` : `CIP & Sanitize added in ${tank} on ${dayLabel(day)}.`,
    )
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  return (
    <FormDialog open onClose={onClose} title="Add CIP & Sanitize" onSubmit={save} loading={busy} error={error} testId="cip-add-dialog">
      <TankSelect label="Tank" tanks={tanks} value={tankId} onChange={setTankId} testId="cip-tank" />
      <TextField
        type="date"
        label="Day"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'cip-day' } }}
      />
      <FormControlLabel
        control={<Switch checked={done} onChange={(e) => setDone(e.target.checked)} slotProps={{ input: { 'data-testid': 'cip-done' } as object }} />}
        label="Already done (records it instead of adding a task)"
      />
    </FormDialog>
  )
}
