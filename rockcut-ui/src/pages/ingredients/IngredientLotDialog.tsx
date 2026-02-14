import { useState, useEffect } from 'react'
import { TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import type { IngredientLot } from '../../lib/types'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import FormDialog from '../../components/FormDialog'
import parseApiError from '../../lib/parseApiError'

interface IngredientLotDialogProps {
  open: boolean
  onClose: () => void
  ingredientId: number
  lot?: IngredientLot
}

export default function IngredientLotDialog({ open, onClose, ingredientId, lot }: IngredientLotDialogProps) {
  const [lotNumber, setLotNumber] = useState('')
  const [supplier, setSupplier] = useState('')
  const [receivedDate, setReceivedDate] = useState('')
  const [status, setStatus] = useState('available')
  const [alphaAcid, setAlphaAcid] = useState('')
  const [colorLovibond, setColorLovibond] = useState('')
  const [potentialGravity, setPotentialGravity] = useState('')
  const [attenuation, setAttenuation] = useState('')
  const [properties, setProperties] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createLot = useApiCreate<IngredientLot>('/api/ingredient_lots', {
    invalidateKeys: [['ingredient', ingredientId]],
  })

  const updateLot = useApiUpdate<IngredientLot>(
    (id) => `/api/ingredient_lots/${id}`,
    { invalidateKeys: [['ingredient', ingredientId]] }
  )

  useEffect(() => {
    if (open) {
      setError(null)
      setLotNumber(lot?.lot_number ?? '')
      setSupplier(lot?.supplier ?? '')
      setReceivedDate(lot?.received_date ?? '')
      setStatus(lot?.status ?? 'available')
      setAlphaAcid(lot?.alpha_acid != null ? String(lot.alpha_acid) : '')
      setColorLovibond(lot?.color_lovibond != null ? String(lot.color_lovibond) : '')
      setPotentialGravity(lot?.potential_gravity != null ? String(lot.potential_gravity) : '')
      setAttenuation(lot?.attenuation != null ? String(lot.attenuation) : '')
      setProperties(lot?.properties != null ? (typeof lot.properties === 'string' ? lot.properties : JSON.stringify(lot.properties, null, 2)) : '')
      setNotes(lot?.notes ?? '')
    }
  }, [open, lot])

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        ingredient_id: ingredientId,
        lot_number: lotNumber || null,
        supplier: supplier || null,
        received_date: receivedDate || null,
        status,
        alpha_acid: alphaAcid ? Number(alphaAcid) : null,
        color_lovibond: colorLovibond ? Number(colorLovibond) : null,
        potential_gravity: potentialGravity ? Number(potentialGravity) : null,
        attenuation: attenuation ? Number(attenuation) : null,
        properties: properties ? JSON.parse(properties) : null,
        notes: notes || null,
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
      open={open}
      onClose={onClose}
      title={lot ? 'Edit Lot' : 'Add Lot'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        label="Lot Number"
        value={lotNumber}
        onChange={(e) => setLotNumber(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Supplier"
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Received Date"
        type="date"
        value={receivedDate}
        onChange={(e) => setReceivedDate(e.target.value)}
        fullWidth
        margin="normal"
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Status</InputLabel>
        <Select
          value={status}
          label="Status"
          onChange={(e) => setStatus(e.target.value)}
        >
          <MenuItem value="available">Available</MenuItem>
          <MenuItem value="depleted">Depleted</MenuItem>
          <MenuItem value="expired">Expired</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label="Alpha Acid (%)"
        type="number"
        value={alphaAcid}
        onChange={(e) => setAlphaAcid(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Color (Lovibond)"
        type="number"
        value={colorLovibond}
        onChange={(e) => setColorLovibond(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Potential Gravity"
        type="number"
        value={potentialGravity}
        onChange={(e) => setPotentialGravity(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Attenuation (%)"
        type="number"
        value={attenuation}
        onChange={(e) => setAttenuation(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Properties (JSON)"
        value={properties}
        onChange={(e) => setProperties(e.target.value)}
        multiline
        rows={3}
        fullWidth
        margin="normal"
        placeholder='{"key": "value"}'
      />
      <TextField
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        multiline
        rows={3}
        fullWidth
        margin="normal"
      />
    </FormDialog>
  )
}
