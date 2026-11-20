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
import { parsePacks } from '../../lib/purchasing'
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
  const { data: categories = [], isLoading: categoriesLoading } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const { data: ingredients = [], isLoading: ingredientsLoading } = useApiList<Ingredient>(['ingredients', 'all'], '/api/ingredients')
  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  const { data: types = [], isLoading: typesLoading } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = categoriesLoading || ingredientsLoading || partiesLoading || typesLoading

  const [grainId, setGrainId] = useState<number | ''>(product?.ingredient_id ?? ingredientId ?? '')
  const [manufacturerId, setManufacturerId] = useState<number | ''>(product?.manufacturer_party_id ?? '')
  const [name, setName] = useState(product?.name ?? '')
  const [notes, setNotes] = useState(product?.notes ?? '')
  const [active, setActive] = useState(product?.active ?? true)
  // D61 §3.5: the reorder point in whole packs (sacks for grain); empty is none.
  const [minimum, setMinimum] = useState(product?.min_on_hand_packs != null ? String(product.min_on_hand_packs) : '')
  const minimumPacks = parsePacks(minimum, 0)
  const minimumOk = minimum.trim() === '' || minimumPacks != null
  const [drafts, setDrafts] = useState<FeatureDrafts | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { grains, children } = grainCategories(categories)
  const grainOptions = children
    .map((c) => ({ category: c, grains: ingredients.filter((i) => i.category_id === c.id) }))
    .filter((g) => g.grains.length > 0)
  const featureTypes = grains ? typesFor(types, grains.id) : []
  // The boxes start from the product's standard once the feature types are in.
  const shown = drafts ?? draftsFrom(product?.features, featureTypes)
  const manufacturers = parties.filter((p) => p.roles?.includes('manufacturer') && (p.active || p.id === product?.manufacturer_party_id))

  const create = useApiCreate<IngredientProduct>('/api/ingredient_products', { invalidateKeys: GRAIN_KEYS })
  const update = useApiUpdate<IngredientProduct>((id) => `/api/ingredient_products/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = create.isPending || update.isPending

  const submit = async () => {
    if (!grainId || !manufacturerId) return setError('Pick the grain and the maltster')
    const payload = {
      ingredient_id: grainId,
      manufacturer_party_id: manufacturerId,
      name: name.trim() || null,
      notes: notes.trim() || null,
      active,
      min_on_hand_packs: minimum.trim() === '' ? null : minimumPacks,
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
      submitDisabled={listsLoading || !draftsValid(shown, featureTypes) || !minimumOk}
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
          value={manufacturers.length ? manufacturerId : ''}
          onChange={(e) => setManufacturerId(e.target.value as number)}
          data-testid="product-maltster"
        >
          {manufacturers.map((p) => (
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
      <TextField
        label="Minimum on hand (sacks)"
        value={minimum}
        onChange={(e) => setMinimum(e.target.value)}
        error={!minimumOk}
        helperText={minimumOk ? 'Below it, the product is marked and shows on To order; empty for none' : 'Whole sacks, 0 or more'}
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'product-minimum' } }}
      />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {product && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
    </FormDialog>
  )
}
