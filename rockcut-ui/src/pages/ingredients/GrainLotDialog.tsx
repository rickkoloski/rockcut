import { useState } from 'react'
import { Box, Button, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import DecimalInput from '../../components/DecimalInput'
import FeatureFields from './FeatureFields'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import parseApiError from '../../lib/parseApiError'
import { LB_DECIMALS, formatQuantity, packSizeLabel, parseDecimal } from '../../lib/brewingUnits'
import { draftsFrom, draftsValid, featuresPayload, lotTypesFor, missingRequired, parseCropYear, requiredLotKeys, typesFor, type FeatureDrafts } from '../../lib/ingredientFeatures'
import { coloradoToday } from '../../lib/tasks'
import { GRAIN_KEYS, lotDeleteBlocked, lotDeleteMessage } from '../../lib/inventory'
import type { FeatureType, IngredientLot, IngredientProduct, InventoryMovement, Party } from '../../lib/types'

interface GrainLotDialogProps {
  open: boolean
  onClose: () => void
  product: IngredientProduct
  lot: IngredientLot | null
  /** The lot's movements (any order): Delete names the stock going with it; the pack size is fixed after the first. */
  movements: InventoryMovement[]
}

/**
 * D60 §3.7: change a grain lot: number, dates, supplier, pack size, its own
 * specs, and Expired (a brewer's call; oldest first skips it). Its stock
 * changes only through movements and counts. Delete only while it has just
 * its first movement and no recipe uses it: otherwise it's disabled with the
 * reason (gap 15, `lotDeleteBlocked`); else a confirm names that stock (gap 9). The pack size is fixed once the lot has
 * a movement after its first (gap 14). D62 §3.4: a hop lot's crop year and
 * alpha can change but not go blank; its box is fixed; the product's typical
 * ranges show beside the boxes.
 */
export default function GrainLotDialog(props: GrainLotDialogProps) {
  return props.open && props.lot ? <GrainLotForm {...props} lot={props.lot} /> : null
}

function GrainLotForm({ onClose, product, lot, movements }: GrainLotDialogProps & { lot: IngredientLot }) {
  const hops = product.category_key === 'hops'
  const { mode } = useQuantityDisplay()
  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  const { data: types = [], isLoading: typesLoading } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = partiesLoading || typesLoading
  const [lotNumber, setLotNumber] = useState(lot.lot_number ?? '')
  const [received, setReceived] = useState(lot.received_date ?? '')
  const [supplierId, setSupplierId] = useState<number | ''>(lot.supplier_party_id ?? '')
  const [packSize, setPackSize] = useState(lot.pack_size ?? '')
  const [cropYear, setCropYear] = useState(lot.crop_year != null ? String(lot.crop_year) : '')
  const [expired, setExpired] = useState(lot.status === 'expired')
  const [notes, setNotes] = useState(lot.notes ?? '')
  const [drafts, setDrafts] = useState<FeatureDrafts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const packSizeFixed = movements.length > 1
  const deleteBlocked = lotDeleteBlocked(lot, movements)

  const featureTypes = hops ? lotTypesFor(types, product.category?.id, product.category?.parent_id) : typesFor(types, product.category?.id, product.category?.parent_id)
  const required = requiredLotKeys(types, product.category?.id, product.category?.parent_id)
  const shown = drafts ?? draftsFrom(lot.features, featureTypes)
  const crop = parseCropYear(cropYear, coloradoToday())
  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === lot.supplier_party_id))
  const size = parseDecimal(packSize, LB_DECIMALS)

  const update = useApiUpdate<IngredientLot>((id) => `/api/ingredient_lots/${id}`, { invalidateKeys: GRAIN_KEYS })
  const remove = useApiDelete((id) => `/api/ingredient_lots/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = update.isPending || remove.isPending

  const submit = async () => {
    if (hops && crop.error) return setError(crop.error)
    const missing = missingRequired(shown, featureTypes, required)
    if (missing.length) return setError(`Enter the ${missing.join(' and ').toLowerCase()}`)
    try {
      await update.mutateAsync({
        id: lot.id,
        lot_number: lotNumber.trim() || null,
        received_date: received || null,
        supplier_party_id: supplierId || null,
        ...(hops ? { crop_year: crop.year } : packSizeFixed ? {} : { pack_size: size.ok ? size.value : null }),
        notes: notes.trim() || null,
        // Back from Expired, the API sets it from on-hand (available or depleted).
        ...(expired !== (lot.status === 'expired') ? { status: expired ? 'expired' : 'available' } : {}),
        features: featuresPayload(shown, lot.features),
      })
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(lot.id)
      onClose()
    } catch (err) {
      setConfirmDelete(false)
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`Lot ${lot.lot_number ?? `#${lot.id}`}`}
      onSubmit={submit}
      loading={loading}
      error={error}
      submitDisabled={listsLoading || !draftsValid(shown, featureTypes) || !size.ok || (hops && !!crop.error)}
      testId="grain-lot-dialog"
      secondaryAction={
        <Box sx={{ maxWidth: { xs: 160, sm: 260 } }}>
          <Button color="error" disabled={loading || !!deleteBlocked} data-testid="lot-delete" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
          {deleteBlocked && (
            <Typography variant="caption" color="text.secondary" component="p" data-testid="lot-delete-reason">
              {deleteBlocked}
            </Typography>
          )}
        </Box>
      }
    >
      <Typography variant="body2" color="text.secondary">
        On hand: {formatQuantity(lot.on_hand, lot.pack_name, lot.pack_size, product.unit, mode)}. Stock changes through Record movement and Count.
      </Typography>
      <TextField label="Lot #" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} fullWidth />
      <TextField label="Received" type="date" value={received} onChange={(e) => setReceived(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
      <FormControl fullWidth>
        <InputLabel id="grain-lot-supplier-label">Supplier</InputLabel>
        <Select labelId="grain-lot-supplier-label" id="grain-lot-supplier" label="Supplier" value={suppliers.length ? supplierId : ''} onChange={(e) => setSupplierId(e.target.value as number | '')}>
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
      {hops ? (
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
      ) : (
        <DecimalInput
          decimals={LB_DECIMALS}
          label={packSizeLabel(lot.pack_name, product.unit)}
          value={packSize}
          onChange={setPackSize}
          disabled={packSizeFixed}
          helperText={packSizeFixed ? 'Fixed: the lot has movements after its first' : undefined}
          fullWidth
          slotProps={{ htmlInput: { 'data-testid': 'grain-lot-pack-size' } }}
        />
      )}
      <FormControlLabel
        control={<Switch checked={expired} onChange={(e) => setExpired(e.target.checked)} data-testid="lot-expired" />}
        label="Expired (stale or damaged: oldest first skips it)"
      />
      {hops ? (
        <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} typical={product.features ?? {}} required={required} disabled={loading} />
      ) : (
        <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} standard={product.features ?? {}} disabled={loading} />
      )}
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      <ConfirmDialog
        open={confirmDelete && !deleteBlocked}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete lot"
        message={lotDeleteMessage(lot, movements, mode)}
        loading={remove.isPending}
        testId="lot-delete-confirm"
      />
    </FormDialog>
  )
}
