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
import { parseDecimal, packSizeLabel, productPack, unitDecimals } from '../../lib/brewingUnits'
import { draftsFrom, draftsValid, featuresPayload, isD65Key, lotTypesFor, missingRequired, parseCropYear, requiredLotKeys, typesFor, unitLabel, type FeatureDrafts } from '../../lib/ingredientFeatures'
import { FUTURE_DATE, GRAIN_KEYS } from '../../lib/inventory'
import { defaultLotSupplier, offerPackText } from '../../lib/purchasing'
import { coloradoToday } from '../../lib/tasks'
import type { FeatureType, IngredientLot, IngredientProduct, Party } from '../../lib/types'

/**
 * D60 §4.4: a lot of a maltster product. The offer sets the supplier and the
 * sack size; the first movement is its opening amount or what was received;
 * the specs start as the product's standard and can be changed for this lot.
 * D62 §4.4: a hop lot is box · 11 lb and asks for its crop year (this year
 * to start) and alpha acid (required), beta and oil, each with the
 * product's typical range beside it; a value outside it is marked but saves.
 */
export default function AddLotDialog({ open, onClose, product }: { open: boolean; onClose: () => void; product: IngredientProduct }) {
  return open ? <AddLotForm onClose={onClose} product={product} /> : null
}

function AddLotForm({ onClose, product }: { onClose: () => void; product: IngredientProduct }) {
  const hops = product.category_key === 'hops'
  const { mode } = useQuantityDisplay()
  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  const { data: types = [], isLoading: typesLoading } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = partiesLoading || typesLoading
  const offers = (product.offers ?? []).filter((o) => o.active)
  const first = offers.length === 1 ? offers[0] : null

  const [offerId, setOfferId] = useState<number | ''>(first?.id ?? '')
  // D65 (decisions 5): with offers, Supplier starts as the reorder offer's, else the newest offer's, and is required.
  const [supplierId, setSupplierId] = useState<number | ''>(() => defaultLotSupplier(offers, product.reorder_offer_id) ?? '')
  const startPack = productPack(product.offers)
  const [packSize, setPackSize] = useState(first?.pack_size ?? (hops ? '11' : String(startPack?.size ?? '')))
  // D62 §3.5: the pack is the offer's (a sack, for grain; always a box of 11 lb, for hops).
  // D65: with no offer or lots, no pack name; the API starts it as the unit's usual pack (lb → bag, …).
  const [packName, setPackName] = useState<string | null>(first?.pack_name ?? startPack?.name ?? (hops ? 'box' : isD65Key(product.category_key) ? null : 'sack'))
  const [cropYear, setCropYear] = useState(coloradoToday().slice(0, 4))
  const [lotNumber, setLotNumber] = useState('')
  const [received, setReceived] = useState(coloradoToday())
  const [kind, setKind] = useState<'opening' | 'received'>('opening')
  const [quantity, setQuantity] = useState<QuantityValue>({ quantity: null, valid: true })
  const [drafts, setDrafts] = useState<FeatureDrafts | null>(null)
  const [error, setError] = useState<string | null>(null)

  const featureTypes = hops ? lotTypesFor(types, product.category?.id, product.category?.parent_id) : typesFor(types, product.category?.id, product.category?.parent_id)
  const required = requiredLotKeys(types, product.category?.id, product.category?.parent_id)
  // A hop lot starts empty: the range is the product's, the actuals come from the supplier's sheet.
  const shown = drafts ?? draftsFrom(hops ? null : product.features, featureTypes)
  const crop = parseCropYear(cropYear, coloradoToday())
  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && p.active)
  // An `each` pack size is whole (D65 §4.3).
  const size = parseDecimal(packSize, unitDecimals(product.unit))
  const packQty = size.ok && size.value ? Number(size.value) : null

  const create = useApiCreate<IngredientLot>('/api/ingredient_lots', { invalidateKeys: GRAIN_KEYS })

  const pickOffer = (id: number | '') => {
    setOfferId(id)
    const o = offers.find((x) => x.id === id)
    if (o) {
      setSupplierId(o.supplier_party_id)
      setPackSize(o.pack_size)
      setPackName(o.pack_name)
    }
  }

  const submit = async () => {
    if (!quantity.valid || !quantity.quantity || Number(quantity.quantity) <= 0) return setError('Enter the quantity')
    if (!received) return setError('Pick the received date')
    if (received > coloradoToday()) return setError(FUTURE_DATE)
    if (hops && crop.error) return setError(crop.error)
    if (offers.length > 0 && !supplierId) return setError('Pick the supplier')
    const missing = missingRequired(shown, featureTypes, required)
    if (missing.length) return setError(`Enter the ${missing.join(' and ').toLowerCase()}`)
    try {
      await create.mutateAsync({
        product_id: product.id,
        supplier_party_id: supplierId || null,
        // A hop lot's pack is the API's to set (box · 11 lb).
        ...(hops ? { crop_year: crop.year } : { pack_name: packName, pack_size: size.ok ? size.value : null }),
        lot_number: lotNumber.trim() || null,
        received_date: received,
        initial_kind: kind,
        initial_quantity: quantity.quantity,
        features: featuresPayload(shown, hops ? null : product.features),
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
      submitDisabled={listsLoading || !draftsValid(shown, featureTypes) || !size.ok || !quantity.valid || (hops && !!crop.error)}
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
                {o.supplier?.name} · {o.order_name ?? 'no order name'} · {offerPackText(o, unitLabel(product))}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <FormControl fullWidth required={offers.length > 0}>
        <InputLabel id="lot-supplier-label">Supplier</InputLabel>
        <Select labelId="lot-supplier-label" id="lot-supplier" label="Supplier" value={suppliers.length ? supplierId : ''} onChange={(e) => setSupplierId(e.target.value as number | '')} data-testid="lot-supplier">
          {offers.length === 0 && (
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
          )}
          {suppliers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {hops ? (
        <TextField label="Pack" value={`box · 11 ${unitLabel(product)}`} disabled fullWidth slotProps={{ htmlInput: { 'data-testid': 'lot-pack-fixed' } }} />
      ) : (
        <DecimalInput
          decimals={unitDecimals(product.unit)}
          label={packSizeLabel(packName, unitLabel(product))}
          value={packSize}
          onChange={setPackSize}
          fullWidth
          slotProps={{ htmlInput: { 'data-testid': 'lot-pack-size' } }}
        />
      )}
      <TextField label="Lot #" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'lot-number' } }} />
      {hops && (
        <TextField
          label="Crop year"
          value={cropYear}
          onChange={(e) => setCropYear(e.target.value)}
          required
          error={!!crop.error}
          helperText={crop.error ?? undefined}
          fullWidth
          slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'lot-crop-year' } }}
        />
      )}
      <TextField
        label="Received"
        type="date"
        value={received}
        onChange={(e) => setReceived(e.target.value)}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: coloradoToday() } }}
      />
      <FormControl>
        <FormLabel id="lot-kind-label">This lot is</FormLabel>
        <RadioGroup row aria-labelledby="lot-kind-label" value={kind} onChange={(e) => setKind(e.target.value as 'opening' | 'received')}>
          <FormControlLabel value="opening" control={<Radio />} label="Opening amount (already here)" />
          <FormControlLabel value="received" control={<Radio />} label="Received" />
        </RadioGroup>
      </FormControl>
      {/* A new pack size starts the boxes again, so packs are always counted in it. */}
      <QuantityInput
        key={`${mode}-${packQty}`}
        mode={mode}
        packSize={packQty}
        packName={packName}
        unit={unitLabel(product)}
        label="Quantity"
        onChange={setQuantity}
        testId="lot-quantity"
      />
      {hops ? (
        <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} typical={product.features ?? {}} required={required} disabled={create.isPending} />
      ) : (
        <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} standard={product.features ?? {}} disabled={create.isPending} />
      )}
    </FormDialog>
  )
}
