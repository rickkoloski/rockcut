import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FormControl, FormControlLabel, InputLabel, ListSubheader, MenuItem, Select, Switch, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import FeatureFields from './FeatureFields'
import RangeFields from './RangeFields'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { httpStatus } from '../../lib/notFound'
import {
  HOP_FORMS,
  draftsFrom,
  draftsValid,
  featuresPayload,
  grainCategories,
  itemLabel,
  keyedCategories,
  manufacturerLabel,
  manufacturersFor,
  productLabel,
  productTypesFor,
  rangeDraftError,
  rangeDraftsFrom,
  rangesPayload,
  typesFor,
  type FeatureDrafts,
  type RangeDrafts,
} from '../../lib/ingredientFeatures'
import { GRAIN_KEYS } from '../../lib/inventory'
import { parsePacks } from '../../lib/purchasing'
import type { FeatureType, Ingredient, IngredientCategory, IngredientProduct, Party } from '../../lib/types'

/** The manufacturer picker's "Other manufacturer…" entry. */
const OTHER = -1

interface ProductDialogProps {
  open: boolean
  onClose: () => void
  /** Editing; otherwise a new maltster product. */
  product?: IngredientProduct
  /** A new product's grain, when known (from a grain's page). */
  ingredientId?: number
  /** D62: a new product's category (`grains` unless said); an edit uses the product's. */
  categoryKey?: 'grains' | 'hops'
}

/**
 * D60 §4.3: a maltster product: grain, maltster, product name, standard
 * specs. D62 §4.3: a hop product: variety, manufacturer, form (from the
 * list), product name, origin, and typical alpha / beta / oil ranges; the
 * unit is lb (the API sets it).
 */
export default function ProductDialog(props: ProductDialogProps) {
  return props.open ? <ProductForm {...props} /> : null
}

function ProductForm({ onClose, product, ingredientId, categoryKey }: ProductDialogProps) {
  const hops = (product?.category_key ?? categoryKey) === 'hops'
  const key = hops ? 'hops' : 'grains'
  const navigate = useNavigate()
  const { data: categories = [], isLoading: categoriesLoading } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const { data: ingredients = [], isLoading: ingredientsLoading } = useApiList<Ingredient>(['ingredients', 'all'], '/api/ingredients')
  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  const { data: types = [], isLoading: typesLoading } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  const { data: products = [], isLoading: productsLoading } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products')
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = categoriesLoading || ingredientsLoading || partiesLoading || typesLoading || productsLoading

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
  const [ranges, setRanges] = useState<RangeDrafts | null>(null)
  const [form, setForm] = useState(product?.form ?? HOP_FORMS[0])
  const [origin, setOrigin] = useState(product?.origin ?? '')
  const [error, setError] = useState<string | null>(null)
  // Gap 9 (D61's pattern): the version this dialog opened, kept if the page
  // refetches under it, so a save over someone else's change stays refused.
  const [version] = useState(product?.lock_version)
  const qc = useQueryClient()

  const { grains, children } = grainCategories(categories)
  const { category: hopsCategory } = keyedCategories(categories, 'hops')
  const grainOptions = hops
    ? hopsCategory
      ? [{ category: hopsCategory, grains: ingredients.filter((i) => i.category_id === hopsCategory.id) }]
      : []
    : children.map((c) => ({ category: c, grains: ingredients.filter((i) => i.category_id === c.id) })).filter((g) => g.grains.length > 0)
  const featureTypes = hops ? [] : grains ? typesFor(types, grains.id) : []
  const rangeTypes = hops && hopsCategory ? productTypesFor(types, hopsCategory.id) : []
  // The boxes start from the product's standard once the feature types are in.
  const shown = drafts ?? draftsFrom(product?.features, featureTypes)
  const shownRanges = ranges ?? rangeDraftsFrom(product?.features, rangeTypes)
  const rangesOk = rangeTypes.every((t) => !rangeDraftError(t, shownRanges[t.key]))
  // D62 lead decisions 1, gap 5: the manufacturers that already make this
  // category's products (maltsters on grain, hop growers on hops) and the
  // product's own; "Other manufacturer…" opens every one, so a new maltster
  // can still be picked.
  const allManufacturers = parties.filter((p) => p.roles?.includes('manufacturer') && (p.active || p.id === product?.manufacturer_party_id))
  const usualManufacturers = manufacturersFor(allManufacturers, products, [key], product?.manufacturer_party_id)
  const [everyManufacturer, setEveryManufacturer] = useState(false)
  const [manufacturerOpen, setManufacturerOpen] = useState(false)
  // Decisions 2, gap 13: MUI closes the menu right after the pick, so a pick
  // of "Other …" marks the close to skip and the full list stays open.
  const keepOpen = useRef(false)
  const showAll = everyManufacturer || (manufacturerId !== '' && !usualManufacturers.some((p) => p.id === manufacturerId))
  const manufacturers = showAll ? allManufacturers : usualManufacturers

  const create = useApiCreate<IngredientProduct>('/api/ingredient_products', { invalidateKeys: GRAIN_KEYS })
  const update = useApiUpdate<IngredientProduct>((id) => `/api/ingredient_products/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = create.isPending || update.isPending

  const submit = async () => {
    if (!grainId || !manufacturerId) return setError(`Pick the ${itemLabel(key).toLowerCase()} and the ${manufacturerLabel(key).toLowerCase()}`)
    const payload = {
      ingredient_id: grainId,
      manufacturer_party_id: manufacturerId,
      name: name.trim() || null,
      notes: notes.trim() || null,
      active,
      min_on_hand_packs: minimum.trim() === '' ? null : minimumPacks,
      ...(hops ? { form, origin: origin.trim() || null, features: rangesPayload(shownRanges, product?.features) } : { features: featuresPayload(shown, product?.features) }),
    }
    try {
      if (product) {
        // Gap 9: the version the dialog opened; a save after someone else's is refused (409).
        await update.mutateAsync({ id: product.id, lock_version: version, ...payload })
        onClose()
      } else {
        const created = await create.mutateAsync(payload)
        onClose()
        navigate(`/ingredients/products/${created.id}`)
      }
    } catch (err) {
      // The person's input stays; the page behind refetches, so reopening shows the change.
      setError(parseApiError(err))
      if (httpStatus(err) === 409) GRAIN_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`${product ? 'Edit' : 'Add'} ${productLabel(key).toLowerCase()}`}
      onSubmit={submit}
      loading={loading}
      error={error}
      submitDisabled={listsLoading || !draftsValid(shown, featureTypes) || !rangesOk || !minimumOk}
      testId="product-dialog"
    >
      <FormControl fullWidth required>
        <InputLabel id="product-grain-label">{itemLabel(key)}</InputLabel>
        <Select
          labelId="product-grain-label"
          id="product-grain"
          label={itemLabel(key)}
          value={grainOptions.length ? grainId : ''}
          onChange={(e) => setGrainId(e.target.value as number)}
          disabled={!!product}
          data-testid="product-grain"
        >
          {grainOptions.flatMap((g) => [
            ...(hops ? [] : [<ListSubheader key={`h${g.category.id}`}>{g.category.name}</ListSubheader>]),
            ...g.grains.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {i.name}
              </MenuItem>
            )),
          ])}
        </Select>
      </FormControl>
      <FormControl fullWidth required>
        <InputLabel id="product-maltster-label">{manufacturerLabel(key)}</InputLabel>
        <Select
          labelId="product-maltster-label"
          id="product-maltster"
          label={manufacturerLabel(key)}
          value={manufacturers.length ? manufacturerId : ''}
          open={manufacturerOpen}
          onOpen={() => setManufacturerOpen(true)}
          onClose={() => {
            if (keepOpen.current) keepOpen.current = false
            else setManufacturerOpen(false)
          }}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              // Open on the full list at once, the value kept until a pick.
              keepOpen.current = true
              setEveryManufacturer(true)
              setManufacturerOpen(true)
            } else setManufacturerId(e.target.value as number)
          }}
          data-testid="product-maltster"
        >
          {manufacturers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
          {!showAll && (
            <MenuItem value={OTHER} data-testid="product-maltster-other">
              {/* Gap 14: grain screens say maltster. */}
              <em>{key === 'grains' ? 'Other maltster…' : 'Other manufacturer…'}</em>
            </MenuItem>
          )}
        </Select>
      </FormControl>
      {hops && (
        <FormControl fullWidth required>
          <InputLabel id="product-form-label">Form</InputLabel>
          <Select labelId="product-form-label" id="product-form" label="Form" value={form} onChange={(e) => setForm(e.target.value)} data-testid="product-form">
            {HOP_FORMS.map((f) => (
              <MenuItem key={f} value={f}>
                {f}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <TextField
        label="Product name"
        helperText={hops ? "The manufacturer's own name, if it has one (e.g. Lupomax)" : "The maltster's own name, if it has one (e.g. Rauch Malt)"}
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
        slotProps={{ htmlInput: { 'data-testid': 'product-name' } }}
      />
      {hops && (
        <TextField
          label="Origin"
          helperText="Where it's grown (USA, New Zealand)"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          fullWidth
          slotProps={{ htmlInput: { maxLength: 100, 'data-testid': 'product-origin' } }}
        />
      )}
      {hops ? (
        <RangeFields types={rangeTypes} drafts={shownRanges} onChange={setRanges} disabled={loading} />
      ) : (
        <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} disabled={loading} />
      )}
      <TextField
        label={`Minimum on hand (${hops ? 'boxes' : 'sacks'})`}
        value={minimum}
        onChange={(e) => setMinimum(e.target.value)}
        error={!minimumOk}
        helperText={minimumOk ? 'Below it, the product is marked and shows on To order; empty for none' : `Whole ${hops ? 'boxes' : 'sacks'}, 0 or more`}
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'product-minimum' } }}
      />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {product && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
    </FormDialog>
  )
}
