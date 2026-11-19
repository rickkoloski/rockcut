import { useState } from 'react'
import { Button, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { LB_DECIMALS, parseDecimal } from '../../lib/brewingUnits'
import { GRAIN_KEYS } from '../../lib/inventory'
import type { Party, SupplierOffer } from '../../lib/types'

interface OfferDialogProps {
  open: boolean
  onClose: () => void
  productId: number
  offer?: SupplierOffer
}

/** D60 §3.6: how a supplier sells a maltster product: order name, sack size, milled or whole. */
export default function OfferDialog(props: OfferDialogProps) {
  return props.open ? <OfferForm {...props} /> : null
}

function OfferForm({ onClose, productId, offer }: OfferDialogProps) {
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const [supplierId, setSupplierId] = useState<number | ''>(offer?.supplier_party_id ?? '')
  const [orderName, setOrderName] = useState(offer?.order_name ?? '')
  const [sackSize, setSackSize] = useState(offer?.sack_size_lb ?? '55')
  const [form, setForm] = useState<'milled' | 'whole'>(offer?.form ?? 'whole')
  const [notes, setNotes] = useState(offer?.notes ?? '')
  const [active, setActive] = useState(offer?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === offer?.supplier_party_id))
  const create = useApiCreate<SupplierOffer>('/api/supplier_offers', { invalidateKeys: GRAIN_KEYS })
  const update = useApiUpdate<SupplierOffer>((id) => `/api/supplier_offers/${id}`, { invalidateKeys: GRAIN_KEYS })
  const remove = useApiDelete((id) => `/api/supplier_offers/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = create.isPending || update.isPending || remove.isPending
  const size = parseDecimal(sackSize, LB_DECIMALS)

  const submit = async () => {
    if (!supplierId) return setError('Pick the supplier')
    if (!size.ok || size.value == null) return setError('Enter the sack size in lb')
    const payload = { product_id: productId, supplier_party_id: supplierId, order_name: orderName.trim() || null, sack_size_lb: size.value, form, notes: notes.trim() || null, active }
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
      submitDisabled={!size.ok}
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
      <DecimalInput decimals={LB_DECIMALS} label="Sack size (lb)" value={sackSize} onChange={setSackSize} required fullWidth slotProps={{ htmlInput: { 'data-testid': 'offer-sack-size' } }} />
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
