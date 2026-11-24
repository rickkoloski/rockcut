import { useState } from 'react'
import { Box, TextField, FormControl, InputLabel, Select, MenuItem, Typography } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import DecimalInput from '../../components/DecimalInput'
import { parseDecimal } from '../../lib/brewingUnits'
import { IONS } from '../../lib/ingredientFeatures'
import type { Ingredient, IngredientCategory } from '../../lib/types'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import FormDialog from '../../components/FormDialog'
import parseApiError from '../../lib/parseApiError'
import { useStrainTypes } from '../../hooks/useStrainTypes'

interface IngredientFormDialogProps {
  open: boolean
  onClose: () => void
  ingredient?: Ingredient
  /**
   * D60 §4.3: a grain: the category is one of this parent's children
   * (Grains → Base, Crystal/Caramel, …).
   */
  parentCategoryId?: number
  /** D62: a hop: always in this category (Hops has no children), so no picker. */
  fixedCategoryId?: number
  /** What it's called when the category is fixed ("Hop"). */
  noun?: string
  /** D65: a new ingredient's category to start with (Other Consumables), still pickable. */
  defaultCategoryId?: number
}

export default function IngredientFormDialog(props: IngredientFormDialogProps) {
  return props.open ? <IngredientForm {...props} /> : null
}

function IngredientForm({ onClose, ingredient, parentCategoryId, fixedCategoryId, noun: fixedNoun, defaultCategoryId }: IngredientFormDialogProps) {
  const [name, setName] = useState(ingredient?.name ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(ingredient?.category_id ?? fixedCategoryId ?? defaultCategoryId ?? '')
  const [notes, setNotes] = useState(ingredient?.notes ?? '')
  // D65 (salts amendment): an optional chemical formula, Water Salts only (lead decisions 3, gap 1).
  const [formula, setFormula] = useState(ingredient?.formula ?? '')
  // D65 (salts amendment): a Water Salts ingredient's ions, ppm @ 1 g/gal, 1 decimal, 0–1000.
  const [ions, setIons] = useState<Record<string, string>>(() =>
    Object.fromEntries(IONS.map((i) => [i.key, ingredient?.ions?.[i.key] != null ? Number(ingredient.ions[i.key]).toFixed(1) : ''])),
  )
  // D64 (A13): a yeast strain's type; only active types are offered, and the one it has stays.
  const [strainTypeId, setStrainTypeId] = useState<number | ''>(ingredient?.yeast_strain_type_id ?? '')
  const qc = useQueryClient()
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
  const salts = !!categories.find((c) => c.id === categoryId)?.catalog?.ions
  const yeast = categories.find((c) => c.id === categoryId)?.catalog?.key === 'yeast'
  const { data: strainTypesReply } = useStrainTypes()
  const strainTypes = (strainTypesReply?.data ?? []).filter((t) => t.active || t.id === ingredient?.yeast_strain_type_id)
  const ionError = (text: string) => {
    const p = parseDecimal(text, 1)
    if (!p.ok) return p.error
    return p.value != null && Number(p.value) > 1000 ? 'At most 1,000' : null
  }
  const ionsOk = !salts || IONS.every((i) => !ionError(ions[i.key]))

  const createIngredient = useApiCreate<Ingredient>('/api/ingredients', {
    invalidateKeys: [['ingredients'], ['yeast_strain_types']],
  })

  const updateIngredient = useApiUpdate<Ingredient>(
    (id) => `/api/ingredients/${id}`,
    { invalidateKeys: [['ingredients'], ['ingredient', ingredient?.id], ['ingredient_products'], ['yeast_strain_types']] }
  )

  const handleSubmit = async () => {
    if (grain && !categoryId) return setError('Pick the grain category')
    try {
      const payload: Record<string, unknown> = {
        name,
        category_id: categoryId || null,
        notes: notes || null,
      }
      // Gap 1: the formula goes only with a Water Salts ingredient; elsewhere a stored one is kept as it is.
      if (salts) payload.formula = formula.trim() || null
      // D64: the type goes only with a yeast strain.
      if (yeast) payload.yeast_strain_type_id = strainTypeId || null

      // D65 Stop 3: the ions go with the ingredient, one request and one transaction.
      if (salts)
        payload.ions = Object.fromEntries(
          IONS.map((i) => {
            const p = parseDecimal(ions[i.key], 1)
            return [i.key, p.ok ? p.value : null]
          }),
        )
      const saved = ingredient ? await updateIngredient.mutateAsync({ id: ingredient.id, ...payload }) : await createIngredient.mutateAsync(payload)
      if (salts) for (const key of [['ingredient', saved.id], ['ingredient_products'], ['ingredient_product']]) await qc.invalidateQueries({ queryKey: key })
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const loading = createIngredient.isPending || updateIngredient.isPending
  const noun = fixedNoun ?? (grain ? 'Grain' : 'Ingredient')

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={ingredient ? `Edit ${noun}` : `Add ${noun}`}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      submitDisabled={listsLoading || !ionsOk}
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
      {fixedCategoryId == null && (
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
      )}
      {yeast && (
        <FormControl fullWidth>
          <InputLabel id="ingredient-strain-type-label">Strain Type</InputLabel>
          <Select
            labelId="ingredient-strain-type-label"
            id="ingredient-strain-type"
            label="Strain Type"
            value={strainTypes.length ? strainTypeId : ''}
            onChange={(e) => setStrainTypeId(e.target.value as number | '')}
            data-testid="ingredient-strain-type"
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {strainTypes.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
                {!t.active && ' (retired)'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      {salts ? (
        <TextField
          label="Formula"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          helperText="Optional, e.g. CaSO₄·2H₂O"
          fullWidth
          slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'ingredient-formula' } }}
        />
      ) : (
        // A formula saved before it was Water Salts only: shown, kept, not edited here.
        ingredient?.formula && (
          <TextField
            label="Formula"
            value={ingredient.formula}
            helperText="Only Water Salts take a formula; this one is kept as it is"
            fullWidth
            slotProps={{ htmlInput: { readOnly: true, 'data-testid': 'ingredient-formula-kept' } }}
          />
        )
      )}
      {salts && (
        <Box data-testid="ingredient-ions">
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Ions (ppm @ 1 g/gal)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            {IONS.map((i) => (
              <DecimalInput
                key={i.key}
                decimals={1}
                label={i.label}
                value={ions[i.key]}
                onChange={(text) => setIons((m) => ({ ...m, [i.key]: text }))}
                helperText={ionError(ions[i.key]) ?? undefined}
                error={!!ionError(ions[i.key])}
                size="small"
                slotProps={{ htmlInput: { 'data-testid': `ion-${i.key}` } }}
              />
            ))}
          </Box>
        </Box>
      )}
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
