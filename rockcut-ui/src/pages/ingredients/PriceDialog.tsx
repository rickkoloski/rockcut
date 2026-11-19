import { useState } from 'react'
import { TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiCreate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { PRICE_DECIMALS, parseDecimal } from '../../lib/brewingUnits'
import { GRAIN_KEYS } from '../../lib/inventory'
import { coloradoToday } from '../../lib/tasks'
import type { OfferPrice, SupplierOffer } from '../../lib/types'

/** D60 §3.6: a new price per sack from a date; the current price is the latest on or before today. */
export default function PriceDialog({ open, onClose, offer }: { open: boolean; onClose: () => void; offer: SupplierOffer | null }) {
  return open && offer ? <PriceForm onClose={onClose} offer={offer} /> : null
}

function PriceForm({ onClose, offer }: { onClose: () => void; offer: SupplierOffer }) {
  const [price, setPrice] = useState('')
  const [effectiveOn, setEffectiveOn] = useState(coloradoToday())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useApiCreate<OfferPrice>(`/api/supplier_offers/${offer.id}/prices`, { invalidateKeys: [...GRAIN_KEYS, ['offer_prices', offer.id]] })
  const parsed = parseDecimal(price, PRICE_DECIMALS)
  const perLb = parsed.ok && parsed.value && Number(offer.sack_size_lb) > 0 ? Number(parsed.value) / Number(offer.sack_size_lb) : null

  const submit = async () => {
    if (!parsed.ok || parsed.value == null) return setError('Enter the price per sack')
    if (!effectiveOn) return setError('Pick the date the price starts')
    try {
      await create.mutateAsync({ price_per_sack: parsed.value, effective_on: effectiveOn, note: note.trim() || null })
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog open phone onClose={onClose} title={`Add price · ${offer.supplier?.name ?? 'Supplier'}`} onSubmit={submit} loading={create.isPending} error={error} submitDisabled={!parsed.ok} testId="price-dialog">
      <DecimalInput
        decimals={PRICE_DECIMALS}
        label="Price per sack ($)"
        value={price}
        onChange={setPrice}
        required
        fullWidth
        autoFocus
        helperText={perLb != null ? `$${perLb.toFixed(4)}/lb for ${Number(offer.sack_size_lb)} lb sacks` : undefined}
        slotProps={{ htmlInput: { 'data-testid': 'price-per-sack' } }}
      />
      <TextField
        label="Effective from"
        type="date"
        value={effectiveOn}
        onChange={(e) => setEffectiveOn(e.target.value)}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'price-effective-on' } }}
      />
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      <Typography variant="caption" color="text.secondary">
        A price from a later date shows as current from that day; the history keeps every price.
      </Typography>
    </FormDialog>
  )
}
