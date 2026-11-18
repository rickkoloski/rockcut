import { useState } from 'react'
import { FormControl, FormControlLabel, FormLabel, InputLabel, MenuItem, Radio, RadioGroup, Select, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import QuantityInput, { type QuantityValue } from '../../components/QuantityInput'
import FeatureFields from './FeatureFields'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import parseApiError from '../../lib/parseApiError'
import { parseDecimal, productSackSize } from '../../lib/brewingUnits'
import { draftsFrom, draftsValid, featuresPayload, typesFor, type FeatureDrafts } from '../../lib/ingredientFeatures'
import { GRAIN_KEYS } from '../../lib/inventory'
import { coloradoToday } from '../../lib/tasks'
import type { FeatureType, IngredientLot, IngredientProduct, Party } from '../../lib/types'

/**
 * D60 §4.4: a lot of a maltster product. The offer sets the supplier and the
 * sack size; the first movement is its opening amount or what was received;
 * the specs start as the product's standard and can be changed for this lot.
 */
export default function AddLotDialog({ open, onClose, product }: { open: boolean; onClose: () => void; product: IngredientProduct }) {
  return open ? <AddLotForm onClose={onClose} product={product} /> : null
}

function AddLotForm({ onClose, product }: { onClose: () => void; product: IngredientProduct }) {
  const { mode } = useQuantityDisplay()
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const { data: types = [] } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  const offers = (product.offers ?? []).filter((o) => o.active)
  const first = offers.length === 1 ? offers[0] : null

  const [offerId, setOfferId] = useState<number | ''>(first?.id ?? '')
  const [supplierId, setSupplierId] = useState<number | ''>(first?.supplier_party_id ?? '')
  const [sackSize, setSackSize] = useState(first?.sack_size_lb ?? String(productSackSize(product.offers) ?? ''))
  const [lotNumber, setLotNumber] = useState('')
  const [received, setReceived] = useState(coloradoToday())
  const [kind, setKind] = useState<'opening' | 'received'>('opening')
  const [quantity, setQuantity] = useState<QuantityValue>({ lb: null, valid: true })
  const [drafts, setDrafts] = useState<FeatureDrafts | null>(null)
  const [error, setError] = useState<string | null>(null)

  const featureTypes = typesFor(types, product.category?.id, product.category?.parent_id)
  const shown = drafts ?? draftsFrom(product.features, featureTypes)
  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && p.active)
  const size = parseDecimal(sackSize)
  const sackLb = size.ok && size.value ? Number(size.value) : null

  const create = useApiCreate<IngredientLot>('/api/ingredient_lots', { invalidateKeys: GRAIN_KEYS })

  const pickOffer = (id: number | '') => {
    setOfferId(id)
    const o = offers.find((x) => x.id === id)
    if (o) {
      setSupplierId(o.supplier_party_id)
      setSackSize(o.sack_size_lb)
    }
  }

  const submit = async () => {
    if (!quantity.valid || !quantity.lb || Number(quantity.lb) <= 0) return setError('Enter the quantity')
    if (!received) return setError('Pick the received date')
    try {
      await create.mutateAsync({
        product_id: product.id,
        supplier_party_id: supplierId || null,
        sack_size_lb: size.ok ? size.value : null,
        lot_number: lotNumber.trim() || null,
        received_date: received,
        initial_kind: kind,
        initial_quantity_lb: quantity.lb,
        features: featuresPayload(shown, product.features),
      })
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
      title={`Add lot · ${product.display_name}`}
      onSubmit={submit}
      loading={create.isPending}
      error={error}
      submitDisabled={!draftsValid(shown) || !size.ok || !quantity.valid}
      testId="add-lot-dialog"
    >
      {offers.length > 0 && (
        <FormControl fullWidth>
          <InputLabel id="lot-offer-label">Supplier offer</InputLabel>
          <Select labelId="lot-offer-label" id="lot-offer" label="Supplier offer" value={offerId} onChange={(e) => pickOffer(e.target.value as number | '')} data-testid="lot-offer">
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {offers.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.supplier?.name} · {o.order_name ?? 'no order name'} · {Number(o.sack_size_lb)} lb {o.form}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <FormControl fullWidth>
        <InputLabel id="lot-supplier-label">Supplier</InputLabel>
        <Select labelId="lot-supplier-label" id="lot-supplier" label="Supplier" value={suppliers.length ? supplierId : ''} onChange={(e) => setSupplierId(e.target.value as number | '')}>
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {suppliers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <DecimalInput label="Sack size (lb)" value={sackSize} onChange={setSackSize} fullWidth slotProps={{ htmlInput: { 'data-testid': 'lot-sack-size' } }} />
      <TextField label="Lot #" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'lot-number' } }} />
      <TextField label="Received" type="date" value={received} onChange={(e) => setReceived(e.target.value)} required fullWidth slotProps={{ inputLabel: { shrink: true } }} />
      <FormControl>
        <FormLabel id="lot-kind-label">This lot is</FormLabel>
        <RadioGroup row aria-labelledby="lot-kind-label" value={kind} onChange={(e) => setKind(e.target.value as 'opening' | 'received')}>
          <FormControlLabel value="opening" control={<Radio />} label="Opening amount (already here)" />
          <FormControlLabel value="received" control={<Radio />} label="Received" />
        </RadioGroup>
      </FormControl>
      {/* A new sack size starts the boxes again, so sacks are always counted in it. */}
      <QuantityInput key={`${mode}-${sackLb}`} mode={mode} sackSize={sackLb} label="Quantity" onChange={setQuantity} testId="lot-quantity" />
      <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} standard={product.features ?? {}} disabled={create.isPending} />
    </FormDialog>
  )
}
