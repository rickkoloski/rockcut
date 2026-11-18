import { useState } from 'react'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from '@mui/material'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import DecimalInput from './DecimalInput'
import { useBackCloses } from '../hooks/useBackCloses'
import { FEATURE_UNITS, UNIT_LABELS, parseDecimal, roundString, toStored, type EnteredUnit } from '../lib/brewingUnits'
import { rangeError } from '../lib/ingredientFeatures'
import type { FeatureType } from '../lib/types'

type Range = Pick<FeatureType, 'label' | 'min' | 'max'>

/** What **Use** hands back: the stored value, and what was typed in which unit. */
export interface ConvertedEntry {
  value: string
  entered_value: string
  entered_unit: EnteredUnit
}

interface ConvertButtonProps {
  featureKey: string
  /** The feature's name and stored unit, for the title ("Extract", "% FGDB"). */
  label: string
  unitLabel: string
  decimals: number
  /** The feature's range: a result outside it can't be used (gap 10). */
  range?: Range
  /** The moisture box on the same form (as typed); as-is extract needs it. */
  moisture?: string
  onUse: (entry: ConvertedEntry) => void
  disabled?: boolean
  testId?: string
}

/**
 * D60 §3.5: the convert button beside Extract, Color and Diastatic power.
 * The popup takes a value in another unit and shows the stored value it
 * becomes; **Use** fills the field and remembers what was typed.
 */
export default function ConvertButton({ featureKey, label, unitLabel, decimals, range, moisture, onUse, disabled, testId }: ConvertButtonProps) {
  const units = FEATURE_UNITS[featureKey]
  const [open, setOpen] = useState(false)
  if (!units) return null
  return (
    <>
      <Tooltip title={`Convert ${label.toLowerCase()} from another unit`}>
        <span>
          <IconButton onClick={() => setOpen(true)} disabled={disabled} aria-label={`Convert ${label}`} data-testid={testId}>
            <SwapHorizIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {open && (
        <ConvertDialog
          featureKey={featureKey}
          units={units}
          label={label}
          unitLabel={unitLabel}
          decimals={decimals}
          range={range}
          moisture={moisture}
          onClose={() => setOpen(false)}
          onUse={(entry) => {
            onUse(entry)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function ConvertDialog({
  featureKey,
  units,
  label,
  unitLabel,
  decimals,
  range,
  moisture,
  onClose,
  onUse,
}: {
  featureKey: string
  units: EnteredUnit[]
  label: string
  unitLabel: string
  decimals: number
  range?: Range
  moisture?: string
  onClose: () => void
  onUse: (entry: ConvertedEntry) => void
}) {
  // The stored unit is first; start on the first other one.
  const [unit, setUnit] = useState<EnteredUnit>(units[1] ?? units[0])
  const [text, setText] = useState('')
  useBackCloses(true, onClose)

  const parsed = parseDecimal(text)
  const typed = parsed.ok && parsed.value != null ? parsed.value : null
  const moistureParsed = parseDecimal(moisture ?? '')
  const moistureValue = moistureParsed.ok && moistureParsed.value != null ? Number(moistureParsed.value) : null
  const result = typed == null ? null : toStored(unit, Number(typed), moistureValue)
  const rounded = result?.ok ? roundString(result.value, decimals) : null
  // A result outside the feature's range (108.2 % FGDB from 50 PPG) is shown but can't be used.
  const outOfRange = rounded != null && range ? rangeError(range, Number(rounded)) : null
  const stored = outOfRange ? null : rounded
  const id = `convert-${featureKey}-unit`

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth data-testid={`convert-dialog-${featureKey}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // The popup sits inside the form it fills: React passes events up through the portal, so this submit mustn't reach that form.
          e.stopPropagation()
          if (stored != null && typed != null) onUse({ value: stored, entered_value: typed, entered_unit: unit })
        }}
      >
        <DialogTitle>Convert {label.toLowerCase()}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <FormControl fullWidth>
            <InputLabel id={id}>Unit</InputLabel>
            <Select labelId={id} id={`${id}-select`} label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as EnteredUnit)}>
              {units.map((u) => (
                <MenuItem key={u} value={u}>
                  {UNIT_LABELS[u]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <DecimalInput label={`Value (${UNIT_LABELS[unit]})`} value={text} onChange={setText} autoFocus fullWidth slotProps={{ htmlInput: { 'data-testid': 'convert-value' } }} />
          {unit === 'as_is' && moistureValue == null && (
            <Alert severity="info" data-testid="convert-needs-moisture">
              As-is extract needs the moisture: enter Moisture on the form first.
            </Alert>
          )}
          {result && !result.ok && unit !== 'as_is' && <Alert severity="error">{result.error}</Alert>}
          {result && !result.ok && unit === 'as_is' && moistureValue != null && <Alert severity="error">{result.error}</Alert>}
          {outOfRange && (
            <Alert severity="error" data-testid="convert-out-of-range">
              {rounded} {unitLabel} is out of range: {outOfRange}
            </Alert>
          )}
          <Typography variant="body2" data-testid="convert-stored">
            Stored as: <strong>{stored != null ? `${stored} ${unitLabel}` : '—'}</strong>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={stored == null} data-testid="convert-use">
            Use
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
