import { useState } from 'react'
import { FormControl, FormHelperText, InputLabel, ListSubheader, MenuItem, Select, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import QuantityInput, { type QuantityValue } from '../../components/QuantityInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import parseApiError from '../../lib/parseApiError'
import { formatQuantity, lotPack, productPack } from '../../lib/brewingUnits'
import { FUTURE_DATE, GRAIN_KEYS, INCOMING, KIND_LABELS, OUTGOING, WITH_PARTNER, oldestFirst, oldestFirstOnHand } from '../../lib/inventory'
import { coloradoToday } from '../../lib/tasks'
import type { IngredientLot, IngredientProduct, InventoryMovement, MovementKind, Party } from '../../lib/types'
import { unitLabel } from '../../lib/ingredientFeatures'

const OLDEST = 'oldest'

interface MovementDialogProps {
  open: boolean
  onClose: () => void
  product: IngredientProduct
  lots: IngredientLot[]
}

/**
 * D60 §4.5, §3.8: use, trade, loan or receive stock. Outgoing kinds default
 * to **Oldest first** (the API takes it from the oldest lots that aren't
 * expired); a brewer can pick one lot instead, an expired one included.
 * Trades and loans name the partner brewery.
 */
export default function MovementDialog(props: MovementDialogProps) {
  return props.open ? <MovementForm {...props} /> : null
}

function MovementForm({ onClose, product, lots }: MovementDialogProps) {
  const { mode } = useQuantityDisplay()
  const { data: parties = [], isLoading: partiesLoading, isError: partiesFailed } = useApiList<Party>(['parties'], '/api/parties')
  const [kind, setKind] = useState<MovementKind>('used')
  const [lotChoice, setLotChoice] = useState<string>(OLDEST)
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [quantity, setQuantity] = useState<QuantityValue>({ quantity: null, valid: true })
  const [date, setDate] = useState(coloradoToday())
  const [note, setNote] = useState('')
  const [partnerMissing, setPartnerMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const outgoing = OUTGOING.includes(kind)
  const sorted = [...lots].sort(oldestFirst)
  // Out: the lots with stock. In: any lot, newest first.
  const choices = outgoing ? sorted.filter((l) => Number(l.on_hand ?? 0) > 0) : [...sorted].reverse()
  const lot = lots.find((l) => String(l.id) === lotChoice) ?? null
  const pack = lot ? lotPack(lot) : productPack(product.offers, lots)
  const partners = parties.filter((p) => p.roles?.includes('partner_brewery') && p.active)
  const needsPartner = WITH_PARTNER.includes(kind)

  const create = useApiCreate<InventoryMovement[]>('/api/inventory_movements', { invalidateKeys: GRAIN_KEYS })

  const pickKind = (k: MovementKind) => {
    setKind(k)
    setPartnerMissing(false)
    if (OUTGOING.includes(k)) {
      if (!lot || Number(lot.on_hand ?? 0) <= 0) setLotChoice(OLDEST)
    } else if (lotChoice === OLDEST) {
      // In: the newest lot that isn't expired, else the newest.
      const newest = [...sorted].reverse()
      setLotChoice(String((newest.find((l) => l.status !== 'expired') ?? newest[0])?.id ?? ''))
    }
  }

  const submit = async () => {
    if (needsPartner && !partnerId) {
      setPartnerMissing(true)
      return setError('Pick the partner brewery for a trade or loan')
    }
    if (!quantity.valid || !quantity.quantity || Number(quantity.quantity) <= 0) return setError('Enter the quantity')
    if (!lotChoice) return setError('Pick the lot')
    if (date > coloradoToday()) return setError(FUTURE_DATE)
    const target = lotChoice === OLDEST ? { product_id: product.id, allocation: 'oldest_first' } : { lot_id: Number(lotChoice) }
    try {
      await create.mutateAsync({
        kind,
        quantity: quantity.quantity,
        occurred_on: date,
        note: note.trim() || null,
        party_id: needsPartner ? partnerId : null,
        ...target,
      })
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const lotLabel = (l: IngredientLot) =>
    `${l.lot_number ?? `#${l.id}`} · received ${l.received_date ?? '—'} · ${formatQuantity(l.on_hand, l.pack_name, l.pack_size, unitLabel(product), mode)}${l.status === 'expired' ? ' · Expired' : ''}`

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`Record movement · ${product.display_name}`}
      onSubmit={submit}
      loading={create.isPending}
      error={error}
      // Lead decisions 2 (item 7): a trade or loan waits for the partner list.
      submitDisabled={(needsPartner && partiesLoading) || !quantity.valid}
      testId="movement-dialog"
    >
      <FormControl fullWidth>
        <InputLabel id="movement-kind-label">Kind</InputLabel>
        <Select labelId="movement-kind-label" id="movement-kind" label="Kind" value={kind} onChange={(e) => pickKind(e.target.value as MovementKind)} data-testid="movement-kind">
          <ListSubheader>Out</ListSubheader>
          {OUTGOING.map((k) => (
            <MenuItem key={k} value={k}>
              {KIND_LABELS[k]}
            </MenuItem>
          ))}
          <ListSubheader>In</ListSubheader>
          {INCOMING.map((k) => (
            <MenuItem key={k} value={k}>
              {KIND_LABELS[k]}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth>
        <InputLabel id="movement-lot-label">Lot</InputLabel>
        <Select labelId="movement-lot-label" id="movement-lot" label="Lot" value={lotChoice} onChange={(e) => setLotChoice(e.target.value)} data-testid="movement-lot">
          {outgoing && <MenuItem value={OLDEST}>Oldest first</MenuItem>}
          {choices.map((l) => (
            <MenuItem key={l.id} value={String(l.id)}>
              {lotLabel(l)}
            </MenuItem>
          ))}
        </Select>
        {outgoing && lotChoice === OLDEST && <FormHelperText>From the oldest lots first, skipping expired lots</FormHelperText>}
      </FormControl>
      {needsPartner && (
        // Not `required` on the control: the browser would stop the form before the app's message (lead decisions 1, item 2).
        <FormControl fullWidth error={partnerMissing}>
          <InputLabel id="movement-partner-label" required>
            Partner brewery
          </InputLabel>
          <Select
            labelId="movement-partner-label"
            id="movement-partner"
            label="Partner brewery"
            value={partners.length ? partnerId : ''}
            disabled={partiesLoading}
            onChange={(e) => {
              setPartnerId(e.target.value as number)
              setPartnerMissing(false)
            }}
            data-testid="movement-partner"
          >
            {partners.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
          {partnerMissing && <FormHelperText>Required for trades and loans</FormHelperText>}
          {/* Lead decisions 2 (item 8): "none" only once the list has answered with none. */}
          {partiesLoading ? (
            <FormHelperText data-testid="movement-partner-loading">Loading partner breweries…</FormHelperText>
          ) : partiesFailed ? (
            <FormHelperText data-testid="movement-partner-failed">Couldn't load the partner breweries: close and try again</FormHelperText>
          ) : (
            partners.length === 0 && <FormHelperText data-testid="movement-partner-none">No partner breweries yet: add one on the Companies page</FormHelperText>
          )}
        </FormControl>
      )}
      <QuantityInput
        key={`${mode}-${pack?.size}`}
        mode={mode}
        packSize={pack?.size ?? null}
        packName={pack?.name}
        unit={unitLabel(product)}
        label="Quantity"
        onChange={setQuantity}
        testId="movement-quantity"
        helperText={lot ? `This lot has ${formatQuantity(lot.on_hand, lot.pack_name, lot.pack_size, unitLabel(product), mode)}` : oldestFirstOnHand(product, pack, mode)}
      />
      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: coloradoToday(), 'data-testid': 'movement-date' } }}
      />
      <TextField label="Note" helperText={kind === 'used' ? 'e.g. the batch' : undefined} value={note} onChange={(e) => setNote(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'movement-note' } }} />
    </FormDialog>
  )
}
