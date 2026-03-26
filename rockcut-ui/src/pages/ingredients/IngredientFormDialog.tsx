import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Divider,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import type { Ingredient, IngredientCategory } from '../../lib/types'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import FormDialog from '../../components/FormDialog'
import parseApiError from '../../lib/parseApiError'
import { useExtractConversions } from '../../hooks/useExtractConversions'
import {
  EXTRACT_LABELS,
  EXTRACT_MEASUREMENTS,
  type ExtractMeasurement,
} from '../../lib/brewingConversions'

interface IngredientFormDialogProps {
  open: boolean
  onClose: () => void
  ingredient?: Ingredient
}

export default function IngredientFormDialog({ open, onClose, ingredient }: IngredientFormDialogProps) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Grain-specific fields (proof-of-concept — values do NOT persist to backend yet)
  const [colorLovibond, setColorLovibond] = useState<string>('')
  const [diastaticPower, setDiastaticPower] = useState<string>('')

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories'
  )

  const createIngredient = useApiCreate<Ingredient>('/api/ingredients', {
    invalidateKeys: [['ingredients']],
  })

  const updateIngredient = useApiUpdate<Ingredient>(
    (id) => `/api/ingredients/${id}`,
    { invalidateKeys: [['ingredients'], ['ingredient', ingredient?.id]] }
  )

  // Extract conversion hook for grain-specific auto-calc
  const extract = useExtractConversions()

  // Determine if the selected category is "Grain"
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  )
  const isGrain = selectedCategory?.name?.toLowerCase() === 'grain'

  useEffect(() => {
    if (open) {
      setError(null)
      setName(ingredient?.name ?? '')
      setCategoryId(ingredient?.category_id ?? '')
      setNotes(ingredient?.notes ?? '')
      // Reset grain fields on open
      setColorLovibond('')
      setDiastaticPower('')
    }
  }, [open, ingredient])

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        category_id: categoryId || null,
        notes: notes || null,
      }

      // TODO: When backend Ingredient schema adds grain fields (extract_cgai,
      // extract_fgdb, extract_ppg, extract_l_deg_kg, moisture, color_lovibond,
      // diastatic_power), include them in the payload here:
      //
      // if (isGrain) {
      //   payload.extract_cgai = extract.values.cgai
      //   payload.extract_fgdb = extract.values.fgdb
      //   payload.extract_ppg = extract.values.ppg
      //   payload.extract_l_deg_kg = extract.values.l_deg_kg
      //   payload.moisture = extract.moisture
      //   payload.color_lovibond = colorLovibond ? Number(colorLovibond) : null
      //   payload.diastatic_power = diastaticPower ? Number(diastaticPower) : null
      // }

      if (ingredient) {
        await updateIngredient.mutateAsync({ id: ingredient.id, ...payload })
      } else {
        await createIngredient.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const loading = createIngredient.isPending || updateIngredient.isPending

  // Helper: format a computed extract value for display
  const formatExtract = (val: number | null): string => {
    if (val === null || val === undefined) return '--'
    return val.toFixed(2)
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={ingredient ? 'Edit Ingredient' : 'Add Ingredient'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      maxWidth={isGrain ? 'md' : 'sm'}
    >
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        fullWidth
        margin="normal"
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Category</InputLabel>
        <Select
          value={categoryId}
          label="Category"
          onChange={(e) => setCategoryId(e.target.value as number | '')}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {categories.map((cat) => (
            <MenuItem key={cat.id} value={cat.id}>
              {cat.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* --- Grain-specific fields (proof-of-concept) --- */}
      {isGrain && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Extract Properties
            <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
              (UI preview — backend persistence pending)
            </Typography>
          </Typography>

          {/* Row 1: Measurement selector + Moisture */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl sx={{ flex: 1 }} margin="normal">
              <InputLabel>Extract Measurement</InputLabel>
              <Select
                value={extract.editableField}
                label="Extract Measurement"
                onChange={(e) => extract.setMeasurement(e.target.value as ExtractMeasurement)}
              >
                {EXTRACT_MEASUREMENTS.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    {m.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Moisture"
              type="number"
              value={extract.moisture * 100}
              onChange={(e) => {
                const pct = parseFloat(e.target.value)
                if (!isNaN(pct)) extract.setMoisture(pct / 100)
              }}
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                },
                htmlInput: { step: 0.1, min: 0, max: 20 },
              }}
              sx={{ flex: 0.5 }}
              margin="normal"
            />
          </Box>

          {/* Row 2: Editable extract field */}
          <TextField
            label={EXTRACT_LABELS[extract.editableField]}
            type="number"
            value={extract.values[extract.editableField] ?? ''}
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              if (!isNaN(val)) extract.setEditableValue(val)
            }}
            fullWidth
            margin="normal"
            slotProps={{
              htmlInput: { step: 0.01 },
            }}
            helperText="Enter value — other units auto-calculate"
          />

          {/* Row 3: Computed extract values (read-only) */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {(Object.keys(EXTRACT_LABELS) as ExtractMeasurement[])
              .filter((m) => m !== extract.editableField)
              .map((m) => (
                <TextField
                  key={m}
                  label={EXTRACT_LABELS[m]}
                  value={formatExtract(extract.values[m])}
                  slotProps={{
                    input: { readOnly: true },
                  }}
                  sx={{
                    flex: 1,
                    minWidth: 120,
                    '& .MuiInputBase-input': { color: 'text.secondary' },
                  }}
                  margin="normal"
                  variant="filled"
                />
              ))}
          </Box>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Grain Characteristics
          </Typography>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Color"
              type="number"
              value={colorLovibond}
              onChange={(e) => setColorLovibond(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">{'\u00B0 Lov'}</InputAdornment>,
                },
                htmlInput: { step: 0.1, min: 0 },
              }}
              sx={{ flex: 1 }}
              margin="normal"
            />
            <TextField
              label="Diastatic Power"
              type="number"
              value={diastaticPower}
              onChange={(e) => setDiastaticPower(e.target.value)}
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">{'\u00B0 Lintner'}</InputAdornment>,
                },
                htmlInput: { step: 1, min: 0 },
              }}
              sx={{ flex: 1 }}
              margin="normal"
            />
          </Box>
        </>
      )}

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
