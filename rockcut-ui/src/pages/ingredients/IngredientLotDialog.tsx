import { useState } from 'react'
import { TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import type { FeatureType, IngredientLot, IngredientLotSummary, Party } from '../../lib/types'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import parseApiError from '../../lib/parseApiError'
import { draftsFrom, draftsValid, featuresPayload, typesFor, type FeatureDrafts } from '../../lib/ingredientFeatures'

interface IngredientLotDialogProps {
  open: boolean
  onClose: () => void
  ingredientId: number
  /** The ingredient's category: which specs the lot has (Hops: alpha acid; Yeast: attenuation). */
  categoryId?: number | null
  lot?: IngredientLot | IngredientLotSummary
}

/**
 * A lot of an ingredient that isn't a grain (grain lots are added on their
 * maltster product's page, D60). D60: its specs are feature values (alpha
 * acid, attenuation) and the supplier is a company; until D62 nothing else
 * changes.
 */
export default function IngredientLotDialog(props: IngredientLotDialogProps) {
  return props.open ? <IngredientLotForm {...props} /> : null
}

function IngredientLotForm({ onClose, ingredientId, categoryId, lot }: IngredientLotDialogProps) {
  const [lotNumber, setLotNumber] = useState(lot?.lot_number ?? '')
  const [supplierId, setSupplierId] = useState<number | ''>(lot?.supplier_party_id ?? '')
  const [receivedDate, setReceivedDate] = useState(lot?.received_date ?? '')
  const [status, setStatus] = useState(lot?.status ?? 'available')
  const [notes, setNotes] = useState(lot?.notes ?? '')
  const [drafts, setDrafts] = useState<FeatureDrafts | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: types = [], isLoading: typesLoading } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = typesLoading || partiesLoading
  const featureTypes = typesFor(types, categoryId)
  const shown = drafts ?? draftsFrom(lot?.features, featureTypes)
  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === lot?.supplier_party_id))

  const createLot = useApiCreate<IngredientLot>('/api/ingredient_lots', {
    invalidateKeys: [['ingredient', ingredientId], ['ingredients']],
  })

  const updateLot = useApiUpdate<IngredientLot>(
    (id) => `/api/ingredient_lots/${id}`,
    { invalidateKeys: [['ingredient', ingredientId], ['ingredients']] }
  )

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        ingredient_id: ingredientId,
        lot_number: lotNumber || null,
        supplier_party_id: supplierId || null,
        received_date: receivedDate || null,
        status,
        notes: notes || null,
        features: featuresPayload(shown, lot?.features),
      }

      if (lot) {
        await updateLot.mutateAsync({ id: lot.id, ...payload })
      } else {
        await createLot.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const loading = createLot.isPending || updateLot.isPending

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={lot ? 'Edit Lot' : 'Add Lot'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      submitDisabled={listsLoading || !draftsValid(shown, featureTypes)}
      testId="ingredient-lot-dialog"
    >
      <TextField
        label="Lot Number"
        value={lotNumber}
        onChange={(e) => setLotNumber(e.target.value)}
        fullWidth
      />
      <FormControl fullWidth>
        <InputLabel id="lot-supplier-label">Supplier</InputLabel>
        <Select
          labelId="lot-supplier-label"
          id="lot-supplier"
          value={suppliers.length ? supplierId : ''}
          label="Supplier"
          onChange={(e) => setSupplierId(e.target.value as number | '')}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {suppliers.map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="Received Date"
        type="date"
        value={receivedDate}
        onChange={(e) => setReceivedDate(e.target.value)}
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <FormControl fullWidth>
        <InputLabel id="lot-status-label">Status</InputLabel>
        <Select
          labelId="lot-status-label"
          id="lot-status"
          value={status}
          label="Status"
          onChange={(e) => setStatus(e.target.value)}
        >
          <MenuItem value="available">Available</MenuItem>
          <MenuItem value="depleted">Depleted</MenuItem>
          <MenuItem value="expired">Expired</MenuItem>
        </Select>
      </FormControl>
      {featureTypes.map((t) => (
        <DecimalInput
          key={t.key}
          decimals={t.decimals}
          label={`${t.label} (${t.unit_label})`}
          value={shown[t.key]?.text ?? ''}
          onChange={(text) => setDrafts({ ...shown, [t.key]: { text, entered_value: null, entered_unit: null } })}
          fullWidth
          slotProps={{ htmlInput: { 'data-testid': `feature-${t.key}` } }}
        />
      ))}
      <TextField
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        rows={3}
        fullWidth
      />
    </FormDialog>
  )
}
