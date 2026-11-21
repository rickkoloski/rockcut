import { useState } from 'react'
import { TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiCreate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { PRICE_DECIMALS, packPlural, parseDecimal, perUnitLabel } from '../../lib/brewingUnits'
import { GRAIN_KEYS } from '../../lib/inventory'
import { coloradoToday } from '../../lib/tasks'
import type { OfferPrice, SupplierOffer } from '../../lib/types'

/** D60 §3.6: a new price per pack (a sack, for grain) from a date; the current price is the latest on or before today. */
export default function PriceDialog({ open, onClose, offer, unit = 'lb' }: { open: boolean; onClose: () => void; offer: SupplierOffer | null; unit?: string }) {
  return open && offer ? <PriceForm onClose={onClose} offer={offer} unit={unit} /> : null
}

function PriceForm({ onClose, offer, unit }: { onClose: () => void; offer: SupplierOffer; unit: string }) {
  const [price, setPrice] = useState('')
  const [effectiveOn, setEffectiveOn] = useState(coloradoToday())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useApiCreate<OfferPrice>(`/api/supplier_offers/${offer.id}/prices`, { invalidateKeys: [...GRAIN_KEYS, ['offer_prices', offer.id]] })
  const parsed = parseDecimal(price, PRICE_DECIMALS)
  const perUnit = parsed.ok && parsed.value && Number(offer.pack_size) > 0 ? Number(parsed.value) / Number(offer.pack_size) : null

  const submit = async () => {
    if (!parsed.ok || parsed.value == null) return setError(`Enter the price per ${offer.pack_name}`)
    if (!effectiveOn) return setError('Pick the date the price starts')
    try {
      await create.mutateAsync({ price_per_pack: parsed.value, effective_on: effectiveOn, note: note.trim() || null })
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog open phone onClose={onClose} title={`Add price · ${offer.supplier?.name ?? 'Supplier'}`} onSubmit={submit} loading={create.isPending} error={error} submitDisabled={!parsed.ok} testId="price-dialog">
      <DecimalInput
        decimals={PRICE_DECIMALS}
        label={`Price per ${offer.pack_name} ($)`}
        value={price}
        onChange={setPrice}
        required
        fullWidth
        autoFocus
        helperText={perUnit != null ? `$${perUnit.toFixed(4)}/${perUnitLabel(unit)} for ${Number(offer.pack_size)} ${unit} ${packPlural(offer.pack_name)}` : undefined}
        slotProps={{ htmlInput: { 'data-testid': 'price-per-pack' } }}
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
