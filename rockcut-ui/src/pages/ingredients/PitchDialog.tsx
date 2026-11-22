import { useState } from 'react'
import { FormControl, FormHelperText, InputLabel, MenuItem, Select, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import QuantityInput, { type QuantityValue } from '../../components/QuantityInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import parseApiError from '../../lib/parseApiError'
import { formatQuantity, minQuantity, productShortName } from '../../lib/brewingUnits'
import { FUTURE_DATE, GRAIN_KEYS, oldestFirst } from '../../lib/inventory'
import { unitLabel, WRAP_ITEM, WRAP_SELECT } from '../../lib/ingredientFeatures'
import { coloradoToday } from '../../lib/tasks'
import type { IngredientLot, IngredientProduct, InventoryMovement, YeastBatch } from '../../lib/types'

const OLDEST = 'oldest'

interface PitchDialogProps {
  open: boolean
  onClose: () => void
  product: IngredientProduct
  lots: IngredientLot[]
}

/**
 * D64 §4.6, §6.4: pitch purchased yeast into a batch: the date (today, never
 * in the future), the batch (an open one), a whole count of bricks or
 * pitchables, the lot (Oldest first unless one is picked) and a note. It
 * writes `used` movements that name the batch.
 */
export default function PitchDialog(props: PitchDialogProps) {
  return props.open ? <PitchForm {...props} /> : null
}

function PitchForm({ onClose, product, lots }: PitchDialogProps) {
  const { mode } = useQuantityDisplay()
  const { data: batches = [], isLoading: batchesLoading } = useApiList<YeastBatch>(['yeast_batches'], '/api/yeast/batches')
  const [date, setDate] = useState(coloradoToday())
  const [batchId, setBatchId] = useState<number | ''>('')
  const [lotChoice, setLotChoice] = useState<string>(OLDEST)
  const [quantity, setQuantity] = useState<QuantityValue>({ quantity: null, valid: true })
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const unit = unitLabel(product)
  const open = batches.filter((b) => b.open)
  const choices = [...lots].sort(oldestFirst).filter((l) => Number(l.on_hand ?? 0) > 0)
  const lot = lots.find((l) => String(l.id) === lotChoice) ?? null
  const onHand = choices.filter((l) => l.status !== 'expired').reduce((n, l) => n + Number(l.on_hand ?? 0), 0)

  const create = useApiCreate<InventoryMovement[]>(`/api/ingredient_products/${product.id}/pitch`, { invalidateKeys: GRAIN_KEYS })

  const submit = async () => {
    if (!batchId) return setError('Pick the batch')
    if (!quantity.valid || !quantity.quantity) return setError(`Enter the ${unit}`)
    if (Number(quantity.quantity) <= 0) return setError(minQuantity(unit))
    if (date > coloradoToday()) return setError(FUTURE_DATE)
    try {
      await create.mutateAsync({
        occurred_on: date,
        batch_id: batchId,
        quantity: quantity.quantity,
        lot_id: lotChoice === OLDEST ? null : Number(lotChoice),
        note: note.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const lotLabel = (l: IngredientLot) =>
    `${l.lot_number ?? `#${l.id}`} · received ${l.received_date ?? '—'} · ${formatQuantity(l.on_hand, l.pack_name, l.pack_size, unit, mode)}${l.status === 'expired' ? ' · Expired' : ''}`

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`Pitch · ${product.display_name}`}
      onSubmit={submit}
      loading={create.isPending}
      error={error}
      submitDisabled={batchesLoading || !quantity.valid}
      submitLabel="Pitch"
      testId="pitch-dialog"
    >
      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: coloradoToday(), 'data-testid': 'pitch-date' } }}
      />
      <FormControl fullWidth required>
        <InputLabel id="pitch-batch-label">Batch</InputLabel>
        <Select labelId="pitch-batch-label" id="pitch-batch" label="Batch" value={open.length ? batchId : ''} onChange={(e) => setBatchId(e.target.value as number)} sx={WRAP_SELECT} data-testid="pitch-batch">
          {open.map((b) => (
            <MenuItem key={b.id} value={b.id} sx={WRAP_ITEM}>
              {b.label}
            </MenuItem>
          ))}
        </Select>
        {!batchesLoading && open.length === 0 && <FormHelperText>No open batches</FormHelperText>}
      </FormControl>
      <QuantityInput
        mode="lb"
        packSize={null}
        unit={unit}
        productName={productShortName(product)}
        positive
        required
        label="Count"
        onChange={setQuantity}
        testId="pitch-quantity"
        helperText={lot ? `This lot has ${formatQuantity(lot.on_hand, lot.pack_name, lot.pack_size, unit, 'lb')}` : `${formatQuantity(onHand, null, null, unit, 'lb')} on hand in lots that aren't expired`}
      />
      <FormControl fullWidth>
        <InputLabel id="pitch-lot-label">Lot</InputLabel>
        <Select labelId="pitch-lot-label" id="pitch-lot" label="Lot" value={lotChoice} onChange={(e) => setLotChoice(e.target.value)} sx={WRAP_SELECT} data-testid="pitch-lot">
          <MenuItem value={OLDEST}>Oldest first</MenuItem>
          {choices.map((l) => (
            <MenuItem key={l.id} value={String(l.id)} sx={WRAP_ITEM}>
              {lotLabel(l)}
            </MenuItem>
          ))}
        </Select>
        {lotChoice === OLDEST && <FormHelperText>From the oldest lots first, skipping expired lots</FormHelperText>}
      </FormControl>
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'pitch-note' } }} />
    </FormDialog>
  )
}
