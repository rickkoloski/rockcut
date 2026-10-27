import { useState } from 'react'
import { Box, Button, Chip, Divider, MenuItem, Paper, TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import {
  OUTAGE_GROUPS,
  TANK_KINDS,
  TANK_LOCATIONS,
  fieldErrors,
  prodError,
  prodPath,
  type Outage,
  type Tank,
  type TankKind,
  type TankLocation,
} from '../../lib/production'

/** A filled "Now" chip that reads in both themes (≥ 4.5:1, D46 QA minor 6). */
const NOW_CHIP = { bgcolor: '#b71c1c', color: '#ffffff' } as const

interface Props {
  /** The tank to edit; none = Add tank. */
  tank: Tank | null
  onClose: () => void
  onSaved: (message: string) => void
  /** Opens the period dialog (Mark out of service…, or Change on one). */
  onOutage: (tank: Tank, outage: Outage | null) => void
}

/**
 * D46 §3.2: Add / Edit tank. Every field; when editing, the Out of service
 * section lists the periods (Now / Coming up / Past) with Change on each and
 * Mark out of service….
 */
export default function TankDialog({ tank, onClose, onSaved, onOutage }: Props) {
  const [name, setName] = useState(tank?.name ?? '')
  const [kind, setKind] = useState<TankKind>(tank?.kind ?? 'unitank')
  const [capacity, setCapacity] = useState(tank ? String(tank.capacity_bbl) : '')
  const [location, setLocation] = useState<TankLocation>(tank?.location ?? 'brewhouse')
  const [notes, setNotes] = useState(tank?.notes ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  usePhoneBackCloses(true, onClose)

  const save = async () => {
    const local: Record<string, string> = {}
    if (!name.trim()) local.name = 'Give the tank a name.'
    if (!(Number(capacity) > 0)) local.capacity_bbl = 'Enter the capacity in bbl.'
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    setError(null)
    const body = { name: name.trim(), kind, capacity_bbl: capacity, location, notes: notes.trim() || null }
    try {
      if (tank) await api.patch(prodPath('tanks', tank.id), body)
      else await api.post(prodPath('tanks'), body)
      onSaved(tank ? `${body.name} saved.` : `${body.name} added.`)
    } catch (err) {
      const fields = fieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setError(prodError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open onClose={onClose} title={tank ? `Edit ${tank.name}` : 'Add tank'} onSubmit={save} loading={busy} error={error} testId="tank-dialog" cancelLabel={tank ? 'Close' : 'Cancel'}>
      <TextField
        label="Name"
        value={name}
        autoFocus={!tank}
        onChange={(e) => setName(e.target.value)}
        error={!!errors.name}
        helperText={errors.name}
        slotProps={{ htmlInput: { maxLength: 30, 'data-testid': 'tank-name' }, formHelperText: { role: 'alert' } as object }}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <TextField select label="Type" value={kind} onChange={(e) => setKind(e.target.value as TankKind)} slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'tank-kind' } as object } }}>
          {TANK_KINDS.map((k) => (
            <MenuItem key={k.key} value={k.key} data-testid={`tank-kind-${k.key}`}>
              {k.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Capacity (bbl)"
          type="number"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          error={!!errors.capacity_bbl}
          helperText={errors.capacity_bbl}
          slotProps={{ htmlInput: { min: 0, step: 'any', 'data-testid': 'tank-capacity' } }}
        />
        <TextField
          select
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value as TankLocation)}
          slotProps={{ select: { SelectDisplayProps: { 'data-testid': 'tank-location' } as object } }}
        >
          {TANK_LOCATIONS.map((l) => (
            <MenuItem key={l.key} value={l.key} data-testid={`tank-location-${l.key}`}>
              {l.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <TextField
        label="Notes"
        multiline
        minRows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000, 'data-testid': 'tank-notes' } }}
      />
      {tank && (
        <>
          <Divider />
          <Box data-testid="tank-outages">
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Out of service
            </Typography>
            {tank.outages.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                No out-of-service periods.
              </Typography>
            )}
            {OUTAGE_GROUPS.map(({ state, label }) => {
              const list = tank.outages.filter((o) => o.state === state)
              if (!list.length) return null
              return (
                <Box key={state} sx={{ mb: 1 }} data-testid={`tank-outages-${state}`}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  {list.map((o) => (
                    <Paper
                      key={o.id}
                      variant="outlined"
                      data-testid={`tank-outage-${o.id}`}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, mt: 0.5, opacity: state === 'past' ? 0.7 : 1 }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>
                          {o.label}
                          {state === 'now' && <Chip size="small" label="Now" sx={{ ml: 1, ...NOW_CHIP }} />}
                        </Typography>
                        {o.reason && (
                          <Typography variant="body2" color="text.secondary">
                            {o.reason}
                          </Typography>
                        )}
                      </Box>
                      <Button size="small" onClick={() => onOutage(tank, o)} data-testid={`tank-outage-change-${o.id}`}>
                        Change
                      </Button>
                    </Paper>
                  ))}
                </Box>
              )
            })}
            <Button variant="outlined" size="small" onClick={() => onOutage(tank, null)} data-testid="tank-mark-out">
              Mark out of service…
            </Button>
          </Box>
        </>
      )}
    </FormDialog>
  )
}
