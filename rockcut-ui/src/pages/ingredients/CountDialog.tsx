import { useState } from 'react'
import { Box, FormControlLabel, Switch, TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import QuantityInput, { type QuantityValue } from '../../components/QuantityInput'
import { useApiCreate } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import parseApiError from '../../lib/parseApiError'
import { formatQuantity, productPack } from '../../lib/brewingUnits'
import { FUTURE_DATE, GRAIN_KEYS, oldestFirst } from '../../lib/inventory'
import { onHandText } from '../../lib/ingredientFeatures'
import { coloradoToday } from '../../lib/tasks'
import type { IngredientLot, IngredientProduct, InventoryMovement } from '../../lib/types'

interface CountDialogProps {
  open: boolean
  onClose: () => void
  product: IngredientProduct
  lots: IngredientLot[]
}

/**
 * D60 §3.8: a count. One total by default: a shortfall comes off the oldest
 * lots that aren't expired, an overage goes onto the newest lot. **Count by
 * lot**: one box per lot with stock (expired lots included); a box left empty
 * isn't changed. A count that matches on-hand is still saved: the history
 * shows "Counted, no change" (gap 11).
 */
export default function CountDialog(props: CountDialogProps) {
  return props.open ? <CountForm {...props} /> : null
}

function CountForm({ onClose, product, lots }: CountDialogProps) {
  const { mode } = useQuantityDisplay()
  const [byLot, setByLot] = useState(false)
  const [date, setDate] = useState(coloradoToday())
  const [total, setTotal] = useState<QuantityValue>({ quantity: null, valid: true })
  const [perLot, setPerLot] = useState<Record<number, QuantityValue>>({})
  const [error, setError] = useState<string | null>(null)

  const pack = productPack(product.offers, lots)
  const counted = [...lots].filter((l) => Number(l.on_hand ?? 0) > 0 || l.status === 'expired').sort(oldestFirst)
  const create = useApiCreate<InventoryMovement[]>(`/api/ingredient_products/${product.id}/count`, { invalidateKeys: GRAIN_KEYS })
  const valid = byLot ? Object.values(perLot).every((v) => v.valid) : total.valid

  const submit = async () => {
    if (date > coloradoToday()) return setError(FUTURE_DATE)
    let body: Record<string, unknown>
    if (byLot) {
      const entries = Object.entries(perLot).filter(([, v]) => v.quantity != null)
      if (entries.length === 0) return setError('Enter the count for at least one lot')
      body = { mode: 'by_lot', counted_on: date, lots: entries.map(([id, v]) => ({ lot_id: Number(id), counted: v.quantity })) }
    } else {
      if (total.quantity == null) return setError('Enter the total counted')
      body = { mode: 'total', counted_on: date, counted: total.quantity }
    }
    try {
      await create.mutateAsync(body)
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`Count · ${product.display_name}`}
      onSubmit={submit}
      loading={create.isPending}
      error={error}
      submitDisabled={!valid}
      testId="count-dialog"
      submitLabel="Save count"
    >
      <Typography variant="body2">
        On hand: <strong data-testid="count-on-hand">{onHandText(product, mode, pack)}</strong>
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={byLot}
            onChange={(e) => {
              setByLot(e.target.checked)
              setError(null)
            }}
            data-testid="count-by-lot"
          />
        }
        label="Count by lot"
      />
      {!byLot && (
        <QuantityInput
          key={`total-${mode}`}
          mode={mode}
          packSize={pack?.size ?? null}
          packName={pack?.name}
          unit={product.unit}
          label="Counted"
          onChange={setTotal}
          testId="count-total"
          helperText="Short: off the oldest lots that aren't expired. Over: onto the newest lot."
        />
      )}
      {byLot &&
        counted.map((l) => (
          <Box key={l.id} data-testid={`count-lot-${l.id}`}>
            <QuantityInput
              key={`${l.id}-${mode}`}
              mode={mode}
              packSize={l.pack_size ? Number(l.pack_size) : null}
              packName={l.pack_name}
              unit={product.unit}
              label={`Lot ${l.lot_number ?? `#${l.id}`}${l.status === 'expired' ? ' (Expired)' : ''}`}
              onChange={(v) => setPerLot((p) => ({ ...p, [l.id]: v }))}
              helperText={`On hand: ${formatQuantity(l.on_hand, l.pack_name, l.pack_size, product.unit, mode)}; leave empty if unchanged`}
              testId={`count-lot-${l.id}`}
            />
          </Box>
        ))}
      {byLot && counted.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No lots with stock.
        </Typography>
      )}
      <TextField
        label="Count date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: coloradoToday(), 'data-testid': 'count-date' } }}
      />
    </FormDialog>
  )
}
