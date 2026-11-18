import { useState } from 'react'
import { Button, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, TextField, Typography } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import FeatureFields from './FeatureFields'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import parseApiError from '../../lib/parseApiError'
import { formatQuantity, parseDecimal } from '../../lib/brewingUnits'
import { draftsFrom, draftsValid, featuresPayload, typesFor, type FeatureDrafts } from '../../lib/ingredientFeatures'
import { GRAIN_KEYS } from '../../lib/inventory'
import type { FeatureType, IngredientLot, IngredientProduct, Party } from '../../lib/types'

interface GrainLotDialogProps {
  open: boolean
  onClose: () => void
  product: IngredientProduct
  lot: IngredientLot | null
}

/**
 * D60 §3.7: change a grain lot: number, dates, supplier, sack size, its own
 * specs, and Expired (a brewer's call; oldest first skips it). Its stock
 * changes only through movements and counts. Delete only while it has just
 * its first movement and no recipe uses it (the API says so otherwise).
 */
export default function GrainLotDialog(props: GrainLotDialogProps) {
  return props.open && props.lot ? <GrainLotForm {...props} lot={props.lot} /> : null
}

function GrainLotForm({ onClose, product, lot }: GrainLotDialogProps & { lot: IngredientLot }) {
  const { mode } = useQuantityDisplay()
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const { data: types = [] } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  const [lotNumber, setLotNumber] = useState(lot.lot_number ?? '')
  const [received, setReceived] = useState(lot.received_date ?? '')
  const [supplierId, setSupplierId] = useState<number | ''>(lot.supplier_party_id ?? '')
  const [sackSize, setSackSize] = useState(lot.sack_size_lb ?? '')
  const [expired, setExpired] = useState(lot.status === 'expired')
  const [notes, setNotes] = useState(lot.notes ?? '')
  const [drafts, setDrafts] = useState<FeatureDrafts | null>(null)
  const [error, setError] = useState<string | null>(null)

  const featureTypes = typesFor(types, product.category?.id, product.category?.parent_id)
  const shown = drafts ?? draftsFrom(lot.features, featureTypes)
  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === lot.supplier_party_id))
  const size = parseDecimal(sackSize)

  const update = useApiUpdate<IngredientLot>((id) => `/api/ingredient_lots/${id}`, { invalidateKeys: GRAIN_KEYS })
  const remove = useApiDelete((id) => `/api/ingredient_lots/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = update.isPending || remove.isPending

  const submit = async () => {
    try {
      await update.mutateAsync({
        id: lot.id,
        lot_number: lotNumber.trim() || null,
        received_date: received || null,
        supplier_party_id: supplierId || null,
        sack_size_lb: size.ok ? size.value : null,
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

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`Lot ${lot.lot_number ?? `#${lot.id}`}`}
      onSubmit={submit}
      loading={loading}
      error={error}
      submitDisabled={!draftsValid(shown) || !size.ok}
      testId="grain-lot-dialog"
      secondaryAction={
        <Button
          color="error"
          disabled={loading}
          data-testid="lot-delete"
          onClick={() =>
            remove
              .mutateAsync(lot.id)
              .then(onClose)
              .catch((err) => setError(parseApiError(err)))
          }
        >
          Delete
        </Button>
      }
    >
      <Typography variant="body2" color="text.secondary">
        On hand: {formatQuantity(lot.on_hand_lb, lot.sack_size_lb, mode)}. Stock changes through Record movement and Count.
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
      <DecimalInput label="Sack size (lb)" value={sackSize} onChange={setSackSize} fullWidth />
      <FormControlLabel
        control={<Switch checked={expired} onChange={(e) => setExpired(e.target.checked)} data-testid="lot-expired" />}
        label="Expired (stale or damaged: oldest first skips it)"
      />
      <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} standard={product.features ?? {}} disabled={loading} />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
    </FormDialog>
  )
}
