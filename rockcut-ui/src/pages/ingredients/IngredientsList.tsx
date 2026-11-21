import { useEffect, useState } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box, Chip, CircularProgress, Collapse, FormControl, FormControlLabel, IconButton, InputAdornment,
  Button, InputLabel, ListItemIcon, ListItemText, Menu, MenuItem, Paper, Select, Switch, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import BusinessIcon from '@mui/icons-material/Business'
import CategoryIcon from '@mui/icons-material/Category'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCartOutlined'
import { PageToolbar, SettingsGear } from '../../components/SettingsMenu'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import type { FeatureType, Ingredient, IngredientCategory, IngredientLotSummary, IngredientProduct, Party } from '../../lib/types'
import { useApiList } from '../../hooks/useApiQuery'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import { formatFeature } from '../../lib/brewingUnits'
import QuantityToggle from '../../components/QuantityToggle'
import { categoryFromParam, categoryParam, rememberLibrarySearch } from '../../lib/libraryView'
import { categoryKey as keyOf, grainCategories, isD65Key, keyedCategories, manufacturerLabel, manufacturersFor, toggleLabels } from '../../lib/ingredientFeatures'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import IngredientFormDialog from './IngredientFormDialog'
import ProductDialog from './ProductDialog'
import GrainsList, { NONE, type GrainFilters } from './GrainsList'

/** A non-grain lot's specs (alpha acid, attenuation), from its feature values. */
function LotValues({ lot, types }: { lot: IngredientLotSummary; types: FeatureType[] }) {
  const values = types
    .filter((t) => lot.features?.[t.key])
    .map((t) => `${t.label} ${formatFeature(lot.features?.[t.key]?.value, t.decimals)}${t.unit_label === '%' ? '%' : ` ${t.unit_label}`}`)
  if (values.length === 0) return null
  return (
    <Typography variant="body2" color="text.secondary" component="span">
      {values.join(' · ')}
    </Typography>
  )
}

function IngredientRow({
  ingredient,
  types,
  onClick,
}: {
  ingredient: Ingredient
  types: FeatureType[]
  onClick: () => void
}) {
  const lots = ingredient.lots ?? []
  const [expanded, setExpanded] = useState(true)

  return (
    <>
      <TableRow
        hover
        sx={{ cursor: 'pointer', '& td': { borderBottom: expanded && lots.length > 0 ? 'none' : undefined } }}
        onClick={onClick}
      >
        <TableCell padding="none" sx={{ width: 40, pl: 0.5 }}>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            disabled={lots.length === 0}
          >
            {expanded && lots.length > 0
              ? <ExpandMoreIcon fontSize="small" />
              : <ChevronRightIcon fontSize="small" sx={{ color: lots.length === 0 ? 'transparent' : undefined }} />
            }
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={500}>{ingredient.name}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" color="text.secondary">{ingredient.notes ?? ''}</Typography>
        </TableCell>
        <TableCell align="right">
          {lots.filter((l) => l.status === 'available').length > 0 && (
            <Chip
              label={`${lots.filter((l) => l.status === 'available').length} on hand`}
              size="small"
              variant="outlined"
            />
          )}
        </TableCell>
      </TableRow>

      {lots.length > 0 && (
        <TableRow>
          <TableCell colSpan={4} sx={{ p: 0, borderBottom: expanded ? undefined : 'none' }}>
            <Collapse in={expanded} unmountOnExit>
              <Box sx={{ backgroundColor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                {lots.map((lot) => (
                  <Box
                    key={lot.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      pl: 7,
                      pr: 2,
                      py: 0.75,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <Typography variant="body2" sx={{ minWidth: 90, color: 'text.secondary' }}>
                      {lot.lot_number ?? '—'}
                    </Typography>
                    <StatusChip status={lot.status} domain="lot" />
                    <LotValues lot={lot} types={types} />
                  </Box>
                ))}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function IngredientsList() {
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState<'ingredient' | 'grain' | 'product' | 'hop' | 'hop-product' | 'd65' | 'd65-product' | null>(null)
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null)
  const [search, setSearch] = useState('')
  const [manufacturerId, setManufacturerId] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [onHandOnly, setOnHandOnly] = useState(false)
  const { mode } = useQuantityDisplay()

  const { data: categories = [], isSuccess: categoriesLoaded } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  // null: not picked yet, which means Grains (D60). '' is All categories.
  // Decisions 5, gap 4: the pick is in the URL (replaced, so Back leaves the
  // library rather than stepping through picks) and remembered for the links back.
  const [params, setParams] = useSearchParams()
  const picked = categoryFromParam(params.get('category'), categoriesLoaded ? categories.map((c) => c.id) : null)
  const setPicked = (value: number | '') =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('category', categoryParam(value))
        return next
      },
      { replace: true },
    )
  useEffect(() => rememberLibrarySearch(picked == null ? '' : `?category=${categoryParam(picked)}`), [picked])
  const { grains: grainsCategory, children } = grainCategories(categories)
  const topLevel = categories.filter((c) => c.parent_id == null).sort((a, b) => a.sort_order - b.sort_order)
  const categoryId = picked ?? grainsCategory?.id ?? ''
  const selected = categories.find((c) => c.id === categoryId)
  const grainsView = !!grainsCategory && (categoryId === grainsCategory.id || selected?.parent_id === grainsCategory.id)
  // D62 §4.1: Hops gets the same list, with its own columns.
  const { category: hopsCategory } = keyedCategories(categories, 'hops')
  const hopsView = !!hopsCategory && categoryId === hopsCategory.id
  // D65 §5.1: Fruits, Spices & Flavorings, Sugars and Extracts and Other
  // Consumables (or one of its children) get the same list.
  const shownKey = keyOf(categories, selected)
  const d65Key = isD65Key(shownKey) ? shownKey : null
  const { category: d65Category, children: d65Children } = keyedCategories(categories, d65Key ?? '')
  const d65View = !!d65Key && !!d65Category
  const productsView = grainsView || hopsView || d65View

  // Every ingredient, so Grains includes its children's (the API filters one category only).
  const { data: allIngredients = [] } = useApiList<Ingredient>(['ingredients', 'all'], '/api/ingredients')
  const { data: products = [] } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products', undefined, { enabled: productsView })
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties', undefined, { enabled: productsView })
  const { data: types = [] } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')

  // A parent category includes its children's ingredients.
  const inCategory = (i: Ingredient) => i.category_id === categoryId || categories.some((c) => c.parent_id === categoryId && c.id === i.category_id)
  const ingredients = categoryId === '' ? allIngredients : allIngredients.filter(inCategory)
  const term = search.toLowerCase()
  const filtered = !search
    ? ingredients
    : ingredients.filter((i) =>
        [i.name, i.category?.name, i.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term)
      )

  const grainIds = new Set(children.map((c) => c.id))
  const grains = allIngredients.filter((i) => grainIds.has(i.category_id))
  const hops = hopsCategory ? allIngredients.filter((i) => i.category_id === hopsCategory.id) : []
  const hopProducts = products.filter((p) => p.category_key === 'hops')
  // D65: the category itself is a group too (Other Consumables' own ingredients, or the only one).
  const d65Groups = d65Category ? [d65Category, ...d65Children] : []
  const d65GroupIds = new Set(d65Groups.map((c) => c.id))
  const d65Ingredients = allIngredients.filter((i) => d65GroupIds.has(i.category_id))
  const d65Products = products.filter((p) => p.category_key === d65Key)
  const filters: GrainFilters = {
    search,
    categoryId: (grainsView && categoryId !== grainsCategory?.id) || (d65View && categoryId !== d65Category?.id) ? (categoryId as number) : null,
    manufacturerId,
    supplierId,
    onHandOnly,
  }
  // D62 lead decisions 1, gap 5: only the manufacturers with products here (maltsters on Grains, hop growers on Hops).
  const manufacturers = manufacturersFor(
    parties.filter((p) => p.roles?.includes('manufacturer')),
    products,
    [hopsView ? 'hops' : (d65Key ?? 'grains')],
  )
  // D65 decision 8: "None" when some product here has no manufacturer.
  const someNone = d65View && d65Products.some((p) => p.manufacturer_party_id == null)
  const suppliers = parties.filter((p) => p.roles?.includes('supplier'))
  const lotTypes = selected ? types.filter((t) => (t.categories ?? []).some((c) => c.category_id === selected.id)) : types.filter((t) => !t.categories?.some((c) => c.category_id === grainsCategory?.id))

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library' }]}
        title="Ingredient Library"
      />

      {/* D52: search and category on the left; Add and the settings gear on the right. */}
      <PageToolbar
        end={
          <>
            {grainsView && <QuantityToggle {...toggleLabels('sack', 'lb')} />}
            {hopsView && <QuantityToggle {...toggleLabels('box', 'lb')} />}
            {/* D65: packs and units differ by product. */}
            {d65View && <QuantityToggle packsLabel="Packs + unit" totalLabel="Total" />}
            {/* D61 §4: Purchasing (orders and receiving). */}
            <Button variant="outlined" startIcon={<ShoppingCartIcon />} component={RouterLink} to="/ingredients/orders" data-testid="ingredients-purchasing">
              Purchasing
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={(e) => (productsView ? setAddAnchor(e.currentTarget) : setFormOpen('ingredient'))}
              // Until the categories are in, it can't tell the Grains view (a menu) from the rest.
              disabled={categories.length === 0}
              data-testid="ingredients-add-button"
            >
              {productsView ? 'Add' : 'Add Ingredient'}
            </Button>
            <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
              {d65View
                ? [
                    <MenuItem key="p" onClick={() => { setAddAnchor(null); setFormOpen('d65-product') }} data-testid="add-d65-product">
                      Product
                    </MenuItem>,
                    <MenuItem key="i" onClick={() => { setAddAnchor(null); setFormOpen('d65') }} data-testid="add-d65-ingredient">
                      Ingredient
                    </MenuItem>,
                  ]
                : hopsView
                ? [
                    <MenuItem key="p" onClick={() => { setAddAnchor(null); setFormOpen('hop-product') }} data-testid="add-hop-product">
                      Hop product
                    </MenuItem>,
                    <MenuItem key="i" onClick={() => { setAddAnchor(null); setFormOpen('hop') }} data-testid="add-hop">
                      Hop
                    </MenuItem>,
                  ]
                : [
                    <MenuItem key="p" onClick={() => { setAddAnchor(null); setFormOpen('product') }} data-testid="add-maltster-product">
                      Maltster product
                    </MenuItem>,
                    <MenuItem key="i" onClick={() => { setAddAnchor(null); setFormOpen('grain') }} data-testid="add-grain">
                      Grain
                    </MenuItem>,
                  ]}
            </Menu>
            {/* The library's setup: the categories (formerly Brewery → Settings) and, D60, the companies. */}
            <SettingsGear label="Ingredient settings" testid="ingredients-settings">
              {(close) => (
                <>
                  <MenuItem component={RouterLink} to="/ingredients/categories" onClick={close} data-testid="ingredients-settings-categories">
                    <ListItemIcon><CategoryIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Ingredient categories" secondary="Categories and their fields" />
                  </MenuItem>
                  <MenuItem component={RouterLink} to="/ingredients/companies" onClick={close} data-testid="ingredients-settings-companies">
                    <ListItemIcon><BusinessIcon fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Companies" secondary="Manufacturers, suppliers, partner breweries" />
                  </MenuItem>
                </>
              )}
            </SettingsGear>
          </>
        }
      >
          <TextField
            size="small"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            sx={{ minWidth: { xs: '100%', sm: 220 } }}
          />
          <FormControl sx={{ minWidth: { xs: '100%', sm: 200 } }} size="small">
            <InputLabel id="ingredients-category-label">Category</InputLabel>
            <Select
              labelId="ingredients-category-label"
              id="ingredients-category"
              value={categories.length ? categoryId : ''}
              label="Category"
              onChange={(e) => setPicked(e.target.value as number | '')}
              data-testid="ingredients-category"
            >
              <MenuItem value="">All Categories</MenuItem>
              {topLevel.flatMap((cat) => [
                <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>,
                ...categories
                  .filter((c) => c.parent_id === cat.id)
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((c) => <MenuItem key={c.id} value={c.id} sx={{ pl: 4 }}>{c.name}</MenuItem>),
              ])}
            </Select>
          </FormControl>
          {productsView && (
            <>
              <FormControl sx={{ minWidth: { xs: 'calc(50% - 6px)', sm: 150 } }} size="small">
                <InputLabel id="grains-maltster-label">{manufacturerLabel(grainsView ? 'grains' : 'hops')}</InputLabel>
                <Select labelId="grains-maltster-label" id="grains-maltster" label={manufacturerLabel(grainsView ? 'grains' : 'hops')} value={manufacturers.length || someNone ? manufacturerId : ''} onChange={(e) => setManufacturerId(e.target.value as number | '')} data-testid="grains-maltster">
                  <MenuItem value="">All</MenuItem>
                  {someNone && <MenuItem value={NONE}>None</MenuItem>}
                  {manufacturers.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl sx={{ minWidth: { xs: 'calc(50% - 6px)', sm: 150 } }} size="small">
                <InputLabel id="grains-supplier-label">Supplier</InputLabel>
                <Select labelId="grains-supplier-label" id="grains-supplier" label="Supplier" value={suppliers.length ? supplierId : ''} onChange={(e) => setSupplierId(e.target.value as number | '')}>
                  <MenuItem value="">All</MenuItem>
                  {suppliers.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Switch checked={onHandOnly} onChange={(e) => setOnHandOnly(e.target.checked)} data-testid="grains-on-hand-only" />}
                label="On hand only"
              />
            </>
          )}
      </PageToolbar>

      {/* D65 (Stop 0 LEAD note 4): while the categories load, a loading state, not "No ingredients found". */}
      {!categoriesLoaded ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }} data-testid="ingredients-loading">
          <CircularProgress size={28} />
        </Box>
      ) : grainsView ? (
        <GrainsList children={children} products={products} grains={grains} types={types} filters={filters} mode={mode} />
      ) : d65View && d65Key ? (
        <GrainsList categoryKey={d65Key} children={d65Groups} products={d65Products} grains={d65Ingredients} types={types} filters={filters} mode={mode} />
      ) : hopsView && hopsCategory ? (
        <GrainsList categoryKey="hops" children={[hopsCategory]} products={hopProducts} grains={hops} types={types} filters={{ ...filters, categoryId: null }} mode={mode} />
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="none" sx={{ width: 40 }} />
                <TableCell>Name</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right" sx={{ pr: 2 }}>On Hand</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                      No ingredients found
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((ingredient) => (
                <IngredientRow
                  key={ingredient.id}
                  ingredient={ingredient}
                  types={lotTypes}
                  onClick={() => navigate(`/ingredients/${ingredient.id}`)}
                />
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <IngredientFormDialog open={formOpen === 'ingredient'} onClose={() => setFormOpen(null)} />
      <IngredientFormDialog open={formOpen === 'grain'} onClose={() => setFormOpen(null)} parentCategoryId={grainsCategory?.id} />
      <ProductDialog open={formOpen === 'product'} onClose={() => setFormOpen(null)} />
      <IngredientFormDialog open={formOpen === 'hop'} onClose={() => setFormOpen(null)} fixedCategoryId={hopsCategory?.id} noun="Hop" />
      <ProductDialog open={formOpen === 'hop-product'} onClose={() => setFormOpen(null)} categoryKey="hops" />
      {/* D65: a new ingredient goes in the category shown (Other Consumables: picked among it and its children). */}
      <IngredientFormDialog
        open={formOpen === 'd65'}
        onClose={() => setFormOpen(null)}
        fixedCategoryId={d65Children.length === 0 || categoryId !== d65Category?.id ? (categoryId as number) : undefined}
        defaultCategoryId={d65Category?.id}
        noun="Ingredient"
      />
      <ProductDialog open={formOpen === 'd65-product'} onClose={() => setFormOpen(null)} categoryKey={d65Key ?? undefined} />
    </>
  )
}
