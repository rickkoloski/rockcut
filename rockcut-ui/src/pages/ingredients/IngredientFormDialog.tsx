import { useState, useEffect } from 'react'
import { TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import type { Ingredient, IngredientCategory } from '../../lib/types'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import FormDialog from '../../components/FormDialog'
import parseApiError from '../../lib/parseApiError'

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

  useEffect(() => {
    if (open) {
      setError(null)
      setName(ingredient?.name ?? '')
      setCategoryId(ingredient?.category_id ?? '')
      setNotes(ingredient?.notes ?? '')
    }
  }, [open, ingredient])

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        category_id: categoryId || null,
        notes: notes || null,
      }

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

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={ingredient ? 'Edit Ingredient' : 'Add Ingredient'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
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
