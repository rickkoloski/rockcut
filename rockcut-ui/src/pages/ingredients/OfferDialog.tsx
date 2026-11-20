import { useState } from 'react'
import { Button, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { LB_DECIMALS, packSizeLabel, parseDecimal } from '../../lib/brewingUnits'
import { GRAIN_KEYS } from '../../lib/inventory'
import type { Party, SupplierOffer } from '../../lib/types'

interface OfferDialogProps {
  open: boolean
  onClose: () => void
  productId: number
  /** The product's unit (lb for grain). */
  unit?: string
  offer?: SupplierOffer
}

/** D60 §3.6: how a supplier sells a product: order name, pack (D62 §3.5: a sack and its size, for grain), milled or whole. */
export default function OfferDialog(props: OfferDialogProps) {
  return props.open ? <OfferForm {...props} /> : null
}

function OfferForm({ onClose, productId, unit = 'lb', offer }: OfferDialogProps) {
  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = partiesLoading
  const [supplierId, setSupplierId] = useState<number | ''>(offer?.supplier_party_id ?? '')
  const [orderName, setOrderName] = useState(offer?.order_name ?? '')
  const [packSize, setPackSize] = useState(offer?.pack_size ?? '55')
  // Stage 1: every offer is a sack (D62 §3.5); hop boxes and other packs come with their categories.
  const packName = offer?.pack_name ?? 'sack'
  const [form, setForm] = useState<'milled' | 'whole'>(offer?.form ?? 'whole')
  const [notes, setNotes] = useState(offer?.notes ?? '')
  const [active, setActive] = useState(offer?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === offer?.supplier_party_id))
  const create = useApiCreate<SupplierOffer>('/api/supplier_offers', { invalidateKeys: GRAIN_KEYS })
  const update = useApiUpdate<SupplierOffer>((id) => `/api/supplier_offers/${id}`, { invalidateKeys: GRAIN_KEYS })
  const remove = useApiDelete((id) => `/api/supplier_offers/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = create.isPending || update.isPending || remove.isPending
  const size = parseDecimal(packSize, LB_DECIMALS)

  const submit = async () => {
    if (!supplierId) return setError('Pick the supplier')
    if (!size.ok || size.value == null) return setError(`Enter the ${packName} size in ${unit}`)
    const payload = {
      product_id: productId,
      supplier_party_id: supplierId,
      order_name: orderName.trim() || null,
      pack_name: packName,
      pack_size: size.value,
      form,
      notes: notes.trim() || null,
      active,
    }
    try {
      if (offer) await update.mutateAsync({ id: offer.id, ...payload })
      else await create.mutateAsync(payload)
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
      title={offer ? 'Edit supplier offer' : 'Add supplier offer'}
      onSubmit={submit}
      loading={loading}
      error={error}
      submitDisabled={listsLoading || !size.ok}
      testId="offer-dialog"
      secondaryAction={
        offer && (
          <Button
            color="error"
            disabled={loading}
            onClick={() =>
              remove
                .mutateAsync(offer.id)
                .then(onClose)
                .catch((err) => setError(parseApiError(err)))
            }
          >
            Delete
          </Button>
        )
      }
    >
      <FormControl fullWidth required>
        <InputLabel id="offer-supplier-label">Supplier</InputLabel>
        <Select labelId="offer-supplier-label" id="offer-supplier" label="Supplier" value={suppliers.length ? supplierId : ''} onChange={(e) => setSupplierId(e.target.value as number)} data-testid="offer-supplier">
          {suppliers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField label="Order name" helperText="The supplier's catalog name" value={orderName} onChange={(e) => setOrderName(e.target.value)} fullWidth />
      <DecimalInput
        decimals={LB_DECIMALS}
        label={packSizeLabel(packName, unit)}
        value={packSize}
        onChange={setPackSize}
        required
        fullWidth
        slotProps={{ htmlInput: { 'data-testid': 'offer-pack-size' } }}
      />
      <FormControl fullWidth>
        <InputLabel id="offer-form-label">We order it</InputLabel>
        <Select labelId="offer-form-label" id="offer-form" label="We order it" value={form} onChange={(e) => setForm(e.target.value as 'milled' | 'whole')}>
          <MenuItem value="whole">Whole</MenuItem>
          <MenuItem value="milled">Milled</MenuItem>
        </Select>
      </FormControl>
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {offer && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
    </FormDialog>
  )
}
