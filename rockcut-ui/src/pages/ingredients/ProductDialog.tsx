import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormControl, FormControlLabel, InputLabel, ListSubheader, MenuItem, Select, Switch, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import FeatureFields from './FeatureFields'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { draftsFrom, draftsValid, featuresPayload, grainCategories, typesFor, type FeatureDrafts } from '../../lib/ingredientFeatures'
import { GRAIN_KEYS } from '../../lib/inventory'
import type { FeatureType, Ingredient, IngredientCategory, IngredientProduct, Party } from '../../lib/types'

interface ProductDialogProps {
  open: boolean
  onClose: () => void
  /** Editing; otherwise a new maltster product. */
  product?: IngredientProduct
  /** A new product's grain, when known (from a grain's page). */
  ingredientId?: number
}

/** D60 §4.3: a maltster product: grain, maltster, product name, standard specs. */
export default function ProductDialog(props: ProductDialogProps) {
  return props.open ? <ProductForm {...props} /> : null
}

function ProductForm({ onClose, product, ingredientId }: ProductDialogProps) {
  const navigate = useNavigate()
  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const { data: ingredients = [] } = useApiList<Ingredient>(['ingredients', 'all'], '/api/ingredients')
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const { data: types = [] } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')

  const [grainId, setGrainId] = useState<number | ''>(product?.ingredient_id ?? ingredientId ?? '')
  const [maltsterId, setMaltsterId] = useState<number | ''>(product?.maltster_party_id ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [notes, setNotes] = useState(product?.notes ?? '')
  const [active, setActive] = useState(product?.active ?? true)
  const [drafts, setDrafts] = useState<FeatureDrafts | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { grains, children } = grainCategories(categories)
  const grainOptions = children
    .map((c) => ({ category: c, grains: ingredients.filter((i) => i.category_id === c.id) }))
    .filter((g) => g.grains.length > 0)
  const featureTypes = grains ? typesFor(types, grains.id) : []
  // The boxes start from the product's standard once the feature types are in.
  const shown = drafts ?? draftsFrom(product?.features, featureTypes)
  const maltsters = parties.filter((p) => p.roles?.includes('maltster') && (p.active || p.id === product?.maltster_party_id))

  const create = useApiCreate<IngredientProduct>('/api/ingredient_products', { invalidateKeys: GRAIN_KEYS })
  const update = useApiUpdate<IngredientProduct>((id) => `/api/ingredient_products/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = create.isPending || update.isPending

  const submit = async () => {
    if (!grainId || !maltsterId) return setError('Pick the grain and the maltster')
    const payload = {
      ingredient_id: grainId,
      maltster_party_id: maltsterId,
      name: name.trim() || null,
      notes: notes.trim() || null,
      active,
      features: featuresPayload(shown, product?.features),
    }
    try {
      if (product) {
        await update.mutateAsync({ id: product.id, ...payload })
        onClose()
      } else {
        const created = await create.mutateAsync(payload)
        onClose()
        navigate(`/ingredients/products/${created.id}`)
      }
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={product ? 'Edit maltster product' : 'Add maltster product'}
      onSubmit={submit}
      loading={loading}
      error={error}
      submitDisabled={!draftsValid(shown, featureTypes)}
      testId="product-dialog"
    >
      <FormControl fullWidth required>
        <InputLabel id="product-grain-label">Grain</InputLabel>
        <Select
          labelId="product-grain-label"
          id="product-grain"
          label="Grain"
          value={grainOptions.length ? grainId : ''}
          onChange={(e) => setGrainId(e.target.value as number)}
          disabled={!!product}
          data-testid="product-grain"
        >
          {grainOptions.flatMap((g) => [
            <ListSubheader key={`h${g.category.id}`}>{g.category.name}</ListSubheader>,
            ...g.grains.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {i.name}
              </MenuItem>
            )),
          ])}
        </Select>
      </FormControl>
      <FormControl fullWidth required>
        <InputLabel id="product-maltster-label">Maltster</InputLabel>
        <Select
          labelId="product-maltster-label"
          id="product-maltster"
          label="Maltster"
          value={maltsters.length ? maltsterId : ''}
          onChange={(e) => setMaltsterId(e.target.value as number)}
          data-testid="product-maltster"
        >
          {maltsters.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="Product name"
        helperText="The maltster's own name, if it has one (e.g. Rauch Malt)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
        slotProps={{ htmlInput: { 'data-testid': 'product-name' } }}
      />
      <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} disabled={loading} />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {product && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
    </FormDialog>
  )
}
