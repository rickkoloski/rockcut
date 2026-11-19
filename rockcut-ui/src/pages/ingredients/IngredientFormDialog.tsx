import { useState } from 'react'
import { TextField, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import type { Ingredient, IngredientCategory } from '../../lib/types'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import FormDialog from '../../components/FormDialog'
import parseApiError from '../../lib/parseApiError'

interface IngredientFormDialogProps {
  open: boolean
  onClose: () => void
  ingredient?: Ingredient
  /**
   * D60 §4.3: a grain: the category is one of this parent's children
   * (Grains → Base, Crystal/Caramel, …).
   */
  parentCategoryId?: number
}

export default function IngredientFormDialog(props: IngredientFormDialogProps) {
  return props.open ? <IngredientForm {...props} /> : null
}

function IngredientForm({ onClose, ingredient, parentCategoryId }: IngredientFormDialogProps) {
  const [name, setName] = useState(ingredient?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(ingredient?.category_id ?? '')
  const [notes, setNotes] = useState(ingredient?.notes ?? '')
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [], isLoading: categoriesLoading } = useApiList<IngredientCategory>(
    ['ingredient_categories'],
    '/api/ingredient_categories'
  )
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = categoriesLoading

  // A grain picks a child of Grains; an ingredient any category, children under their parent.
  const parentId = parentCategoryId ?? categories.find((c) => c.id === ingredient?.category_id)?.parent_id ?? undefined
  const byOrder = (a: IngredientCategory, b: IngredientCategory) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  const options = parentId != null
    ? categories.filter((c) => c.parent_id === parentId).sort(byOrder).map((c) => ({ category: c, child: false }))
    : categories
        .filter((c) => c.parent_id == null)
        .sort(byOrder)
        .flatMap((p) => [{ category: p, child: false }, ...categories.filter((c) => c.parent_id === p.id).sort(byOrder).map((c) => ({ category: c, child: true }))])
  const grain = parentId != null

  const createIngredient = useApiCreate<Ingredient>('/api/ingredients', {
    invalidateKeys: [['ingredients']],
  })

  const updateIngredient = useApiUpdate<Ingredient>(
    (id) => `/api/ingredients/${id}`,
    { invalidateKeys: [['ingredients'], ['ingredient', ingredient?.id], ['ingredient_products']] }
  )

  const handleSubmit = async () => {
    if (grain && !categoryId) return setError('Pick the grain category')
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
  const noun = grain ? 'Grain' : 'Ingredient'

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={ingredient ? `Edit ${noun}` : `Add ${noun}`}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      submitDisabled={listsLoading}
      testId="ingredient-dialog"
    >
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        fullWidth
        slotProps={{ htmlInput: { 'data-testid': 'ingredient-name' } }}
      />
      <FormControl fullWidth required={grain}>
        <InputLabel id="ingredient-category-label">{grain ? 'Grain category' : 'Category'}</InputLabel>
        <Select
          labelId="ingredient-category-label"
          id="ingredient-category"
          value={categories.length ? categoryId : ''}
          label={grain ? 'Grain category' : 'Category'}
          onChange={(e) => setCategoryId(e.target.value as number | '')}
          data-testid="ingredient-category"
        >
          {!grain && (
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
          )}
          {options.map(({ category, child }) => (
            <MenuItem key={category.id} value={category.id} sx={child ? { pl: 4 } : undefined}>
              {category.name}
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
      />
    </FormDialog>
  )
}
