import { useRef, useState, type Ref } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FormControl, FormControlLabel, FormHelperText, InputLabel, ListSubheader, MenuItem, Select, Switch, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
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
  isD65Key,
  isRangeType,
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
  unitLabel,
  unitsFor,
  type FeatureDrafts,
  type RangeDrafts,
} from '../../lib/ingredientFeatures'
import { GRAIN_KEYS, refreshAfterConflict } from '../../lib/inventory'
import { parsePacks } from '../../lib/purchasing'
import { packPlural } from '../../lib/brewingUnits'
import type { FeatureType, Ingredient, IngredientCategory, IngredientProduct, Party } from '../../lib/types'

/**
 * D65 lead decisions 3 (gap 2): the search box at the top of the full
 * manufacturer list. Select gives every child `role="option"` and a click
 * handler; this header takes neither (it isn't a choice), and the menu's
 * keyboard skips it as it skips a ListSubheader.
 */
function SearchHeader({ inputRef, value, onChange }: { inputRef: Ref<HTMLInputElement>; value: string; onChange: (text: string) => void }) {
  return (
    <ListSubheader role="presentation" sx={{ pt: 1, pb: 1, bgcolor: 'background.paper' }}>
      <TextField
        inputRef={inputRef}
        size="small"
        fullWidth
        placeholder="Search companies"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Typing here isn't the menu's jump-to-letter; Escape and Tab close it, and
        // ArrowDown goes to the first choice (the menu's own arrows only step between its items).
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Tab') return
          e.stopPropagation()
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            e.currentTarget.closest('[role="listbox"]')?.querySelector<HTMLElement>('[role="option"]:not(.Mui-disabled)')?.focus()
          }
        }}
        slotProps={{ htmlInput: { 'aria-label': 'Search companies', 'data-testid': 'product-maltster-search' } }}
      />
    </ListSubheader>
  )
}
SearchHeader.muiSkipListHighlight = true

/** The manufacturer picker's "Other manufacturer…" entry. */
const OTHER = -1

interface ProductDialogProps {
  open: boolean
  onClose: () => void
  /** Editing; otherwise a new maltster product. */
  product?: IngredientProduct
  /** A new product's grain, when known (from a grain's page). */
  ingredientId?: number
  /** D62: a new product's category (`grains` unless said); an edit uses the product's. D65: any managed key. */
  categoryKey?: string
  /** D62/D65: the product has lots, so its unit is fixed. */
  hasLots?: boolean
}

/**
 * D60 §4.3: a maltster product: grain, maltster, product name, standard
 * specs. D62 §4.3: a hop product: variety, manufacturer, form (from the
 * list), product name, origin, and typical alpha / beta / oil ranges; the
 * unit is lb (the API sets it). D65 §5.3: a fruit, spice, sugar or other
 * consumable product: ingredient, manufacturer (optional, "None"), form and
 * unit from the category's (or child's) lists, the unit set by the form for
 * sugars (Dry is lb) and fixed once the product has a lot; no features yet.
 */
export default function ProductDialog(props: ProductDialogProps) {
  return props.open ? <ProductForm {...props} /> : null
}

function ProductForm({ onClose, product, ingredientId, categoryKey, hasLots = false }: ProductDialogProps) {
  const given = product?.category_key ?? categoryKey ?? 'grains'
  const hops = given === 'hops'
  const d65 = isD65Key(given)
  const key = hops || d65 ? given : 'grains'
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
  const [form, setForm] = useState(product?.form ?? (d65 ? '' : HOP_FORMS[0]))
  // D65: the unit, from the category's (or child's) list; '' until picked.
  const [unit, setUnit] = useState(d65 ? (product?.unit ?? '') : 'lb')
  const [origin, setOrigin] = useState(product?.origin ?? '')
  const [error, setError] = useState<string | null>(null)
  // Gap 9 (D61's pattern): the version this dialog opened, kept if the page
  // refetches under it, so a save over someone else's change stays refused.
  const [version] = useState(product?.lock_version)
  const qc = useQueryClient()

  const { grains, children } = grainCategories(categories)
  const { category: hopsCategory } = keyedCategories(categories, 'hops')
  // D65: the category and its children (Other Consumables → Water Salts, Finings), each with its ingredients.
  const { category: d65Category, children: d65Children } = keyedCategories(categories, key)
  const grainOptions = hops
    ? hopsCategory
      ? [{ category: hopsCategory, grains: ingredients.filter((i) => i.category_id === hopsCategory.id) }]
      : []
    : d65
      ? (d65Category ? [d65Category, ...d65Children] : [])
          .map((c) => ({ category: c, grains: ingredients.filter((i) => i.category_id === c.id) }))
          .filter((g) => g.grains.length > 0)
      : children.map((c) => ({ category: c, grains: ingredients.filter((i) => i.category_id === c.id) })).filter((g) => g.grains.length > 0)
  // Headings only where there's more than one group (Grains' children, Other Consumables').
  const headed = !hops && (!d65 || grainOptions.length > 1)
  const catalog = categories.find((c) => c.id === ingredients.find((i) => i.id === grainId)?.category_id)?.catalog
  const forms = d65 ? (catalog?.forms ?? []) : []
  const units = d65 ? unitsFor(catalog, form || null) : []
  // One unit for the form (Dry sugar, Water Salts): it's that one.
  const shownUnit = units.length === 1 ? units[0] : unit
  // D65 §4.4: the ingredient's category's product features: a standard (sugars' extract) or a range (fruit's Brix).
  const ingredientCategory = categories.find((c) => c.id === ingredients.find((i) => i.id === grainId)?.category_id)
  const d65Types = d65 && ingredientCategory ? productTypesFor(types, ingredientCategory.id, ingredientCategory.parent_id) : []
  const d65Range = (t: FeatureType) => isRangeType(t, ingredientCategory?.id, ingredientCategory?.parent_id)
  const featureTypes = hops ? [] : d65 ? d65Types.filter((t) => !d65Range(t)) : grains ? typesFor(types, grains.id) : []
  const rangeTypes = hops && hopsCategory ? productTypesFor(types, hopsCategory.id) : d65 ? d65Types.filter(d65Range) : []
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
  // D65 lead decisions 3 (gap 2): the full list has a search box (it's every
  // manufacturer company); the chosen one always stays in it.
  const [manufacturerSearch, setManufacturerSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const searchText = manufacturerSearch.trim().toLowerCase()
  const manufacturers = showAll ? allManufacturers.filter((p) => !searchText || p.id === manufacturerId || p.name.toLowerCase().includes(searchText)) : usualManufacturers
  // On a phone, back closes the open list only, not the product dialog under it.
  usePhoneBackCloses(manufacturerOpen, () => setManufacturerOpen(false))

  // The minimum counts packs: sacks for grain, boxes for hops, the offers' pack for D65 (packs until it has one).
  const minimumPacksWord = hops ? 'boxes' : d65 ? packPlural(product?.offers?.[0]?.pack_name) : 'sacks'

  const create = useApiCreate<IngredientProduct>('/api/ingredient_products', { invalidateKeys: GRAIN_KEYS })
  const update = useApiUpdate<IngredientProduct>((id) => `/api/ingredient_products/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = create.isPending || update.isPending

  const submit = async () => {
    if (d65) {
      if (!grainId) return setError('Pick the ingredient')
      if (!form) return setError('Pick the form')
      if (!shownUnit || !units.includes(shownUnit)) return setError('Pick the unit')
    } else if (!grainId || !manufacturerId) return setError(`Pick the ${itemLabel(key).toLowerCase()} and the ${manufacturerLabel(key).toLowerCase()}`)
    const payload = {
      ingredient_id: grainId,
      // D65 decision 8: None is no manufacturer.
      manufacturer_party_id: manufacturerId || null,
      name: name.trim() || null,
      notes: notes.trim() || null,
      active,
      min_on_hand_packs: minimum.trim() === '' ? null : minimumPacks,
      ...(hops
        ? { form, origin: origin.trim() || null, features: rangesPayload(shownRanges, product?.features) }
        : d65
          ? { form, unit: shownUnit, features: { ...featuresPayload(shown, product?.features), ...rangesPayload(shownRanges, product?.features) } }
          : { features: featuresPayload(shown, product?.features) }),
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
      // Decisions 4: Save and Cancel stay busy until the refetch lands, so a
      // quick close and reopen can't pick up the old version (a second 409).
      if (httpStatus(err) === 409) await refreshAfterConflict(qc)
      setError(parseApiError(err))
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
          onChange={(e) => {
            setGrainId(e.target.value as number)
            // D65: another category's lists; the form and unit are picked again.
            if (d65) {
              setForm('')
              setUnit('')
            }
          }}
          disabled={!!product}
          data-testid="product-grain"
        >
          {grainOptions.flatMap((g) => [
            ...(headed ? [<ListSubheader key={`h${g.category.id}`}>{g.category.name}</ListSubheader>] : []),
            ...g.grains.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {i.name}
              </MenuItem>
            )),
          ])}
        </Select>
      </FormControl>
      <FormControl fullWidth required={!d65}>
        {/* D65: None shows as a value, so the label sits above it. */}
        <InputLabel id="product-maltster-label" shrink={d65 || undefined}>
          {manufacturerLabel(key)}
        </InputLabel>
        <Select
          labelId="product-maltster-label"
          id="product-maltster"
          label={manufacturerLabel(key)}
          value={manufacturers.length || d65 ? manufacturerId : ''}
          displayEmpty={d65}
          notched={d65 || undefined}
          open={manufacturerOpen}
          onOpen={() => setManufacturerOpen(true)}
          onClose={() => {
            if (keepOpen.current) keepOpen.current = false
            else {
              setManufacturerOpen(false)
              setManufacturerSearch('')
            }
          }}
          // The menu focuses its selected item as it opens; the search box takes it after.
          MenuProps={{ TransitionProps: { onEntered: () => searchRef.current?.focus() }, slotProps: { paper: { sx: { maxHeight: 420 } } } }}
          onChange={(e) => {
            const picked = e.target.value as number | ''
            if (picked === '') setManufacturerId('')
            else if (picked === OTHER) {
              // Open on the full list at once, the value kept until a pick.
              keepOpen.current = true
              setEveryManufacturer(true)
              setManufacturerOpen(true)
              setTimeout(() => searchRef.current?.focus())
            } else setManufacturerId(picked)
          }}
          data-testid="product-maltster"
        >
          {showAll && <SearchHeader inputRef={searchRef} value={manufacturerSearch} onChange={setManufacturerSearch} />}
          {/* D65 decision 8: no manufacturer, shown as None. */}
          {d65 && (
            <MenuItem value="" data-testid="product-maltster-none">
              None
            </MenuItem>
          )}
          {manufacturers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
          {showAll && manufacturers.length === 0 && (
            <MenuItem disabled value={-2}>
              No company matches; add it on the Companies page with the Manufacturer role
            </MenuItem>
          )}
          {!showAll && (
            <MenuItem value={OTHER} data-testid="product-maltster-other">
              {/* Gap 14: grain screens say maltster. */}
              <em>{key === 'grains' ? 'Other maltster…' : 'Other manufacturer…'}</em>
            </MenuItem>
          )}
        </Select>
      </FormControl>
      {hops && (
        <FormControl fullWidth required disabled={hasLots}>
          <InputLabel id="product-form-label">Form</InputLabel>
          <Select labelId="product-form-label" id="product-form" label="Form" value={form} onChange={(e) => setForm(e.target.value)} data-testid="product-form">
            {HOP_FORMS.map((f) => (
              <MenuItem key={f} value={f}>
                {f}
              </MenuItem>
            ))}
          </Select>
          {hasLots && <FormHelperText>This product has lots, so its form stays {product?.form}</FormHelperText>}
        </FormControl>
      )}
      {d65 && (
        <FormControl fullWidth required disabled={!catalog || hasLots}>
          <InputLabel id="product-form-label">Form</InputLabel>
          <Select
            labelId="product-form-label"
            id="product-form"
            label="Form"
            value={forms.includes(form) ? form : ''}
            onChange={(e) => {
              const next = e.target.value
              setForm(next)
              // Sugars: the form sets the unit (Dry is lb); an old pick outside the list goes.
              const allowed = unitsFor(catalog, next)
              if (!hasLots && !allowed.includes(unit)) setUnit(allowed.length === 1 ? allowed[0] : '')
            }}
            data-testid="product-form"
          >
            {forms.map((f) => (
              <MenuItem key={f} value={f}>
                {f}
              </MenuItem>
            ))}
          </Select>
          {/* D65 lead decisions 1: fixed once it has lots, as the unit is. */}
          {hasLots && <FormHelperText>This product has lots, so its form stays {product?.form}</FormHelperText>}
        </FormControl>
      )}
      {d65 && (
        <FormControl fullWidth required disabled={!form || hasLots || units.length === 1}>
          <InputLabel id="product-unit-label">Unit</InputLabel>
          <Select
            labelId="product-unit-label"
            id="product-unit"
            label="Unit"
            value={units.includes(shownUnit) ? shownUnit : ''}
            onChange={(e) => setUnit(e.target.value)}
            data-testid="product-unit"
          >
            {units.map((u) => (
              <MenuItem key={u} value={u}>
                {unitLabel({ unit: u, form })}
              </MenuItem>
            ))}
          </Select>
          {hasLots && <FormHelperText>This product has lots, so its unit stays {unitLabel(product)}</FormHelperText>}
        </FormControl>
      )}
      <TextField
        label="Product name"
        helperText={hops || d65 ? "The manufacturer's own name, if it has one (e.g. Lupomax, Whirlfloc T)" : "The maltster's own name, if it has one (e.g. Rauch Malt)"}
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
      ) : d65 ? (
        <>
          {/* Only the categories that have features (sugars' extract, fruit's Brix range). */}
          {featureTypes.length > 0 && <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} disabled={loading} />}
          {rangeTypes.length > 0 && <RangeFields types={rangeTypes} drafts={shownRanges} onChange={setRanges} disabled={loading} />}
        </>
      ) : (
        <FeatureFields types={featureTypes} drafts={shown} onChange={setDrafts} disabled={loading} />
      )}
      <TextField
        label={`Minimum on hand (${minimumPacksWord})`}
        value={minimum}
        onChange={(e) => setMinimum(e.target.value)}
        error={!minimumOk}
        helperText={minimumOk ? 'Below it, the product is marked and shows on To order; empty for none' : `Whole ${minimumPacksWord}, 0 or more`}
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'product-minimum' } }}
      />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {product && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
    </FormDialog>
  )
}
