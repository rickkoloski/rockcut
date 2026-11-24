import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  Chip,
  CardActionArea,
  CardContent,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { formatFeature, type QuantityDisplay } from '../../lib/brewingUnits'
import { formatRange, makerName, onHandText, productMatches, unitLabel } from '../../lib/ingredientFeatures'
import type { FeatureType, Ingredient, IngredientCategory, IngredientProduct } from '../../lib/types'

export interface GrainFilters {
  search: string
  /** One child category (Base, …), or all of Grains. */
  categoryId: number | null
  /** D65: `NONE` for the products with no manufacturer. */
  manufacturerId: number | ''
  supplierId: number | ''
  onHandOnly: boolean
  /** D64 §6.1: Yeast Strains' form (Dry, Liquid) and Strain Type filters; '' is all. */
  form?: string
  strainTypeId?: number | ''
}

/** D65: the manufacturer filter's "None" (products with no manufacturer). */
export const NONE = 0

interface GrainsListProps {
  /** D62: the category the list is of (`grains` or `hops`); D65: `fruits`, `spices`, `sugars`, `consumables`. */
  categoryKey?: string
  /** The groups: Grains' children; for hops, Hops itself (one group, no heading); Other Consumables and its children. */
  children: IngredientCategory[]
  products: IngredientProduct[]
  /** The category's ingredients (grains, hop varieties). */
  grains: Ingredient[]
  types: FeatureType[]
  filters: GrainFilters
  mode: QuantityDisplay
  /** D64: Strain Type names by id (the Yeast Strains view's Type column). */
  strainTypes?: Map<number, string>
}

const SPEC_COLUMNS: Record<string, readonly string[]> = {
  grains: ['color_lovibond', 'extract_fgdb', 'diastatic_power_lintner', 'protein_pct', 'moisture_pct'],
  hops: ['alpha_acid_pct', 'beta_acid_pct', 'total_oil_ml_100g'],
  // D65 §5.1: fruit's typical Brix range; sugars' extract.
  fruits: ['brix'],
  sugars: ['extract_fgdb'],
  // D64 §6.1: yeast's temp and attenuation ranges.
  yeast: ['ferm_temp_f', 'attenuation_pct'],
}
/** Columns that are a typical range on the product (low–high). */
const RANGE_COLUMNS = new Set(['alpha_acid_pct', 'beta_acid_pct', 'total_oil_ml_100g', 'brix', 'ferm_temp_f', 'attenuation_pct'])
const SHORT_LABELS: Record<string, string> = {
  color_lovibond: 'Color °L',
  extract_fgdb: 'Extract % FGDB',
  diastatic_power_lintner: 'DP °Lintner',
  protein_pct: 'Protein %',
  moisture_pct: 'Moisture %',
  alpha_acid_pct: 'Alpha %',
  beta_acid_pct: 'Beta %',
  total_oil_ml_100g: 'Oil mL/100 g',
  brix: 'Brix °Bx',
  ferm_temp_f: 'Temp °F',
  attenuation_pct: 'Atten. %',
}

const money = (v: string) => `$${Number(v).toFixed(2)}`

/**
 * D60 §4.1: the Grains view of the Ingredient Library. Grouped by child
 * category (collapsible), one row per maltster product, a grain with no
 * products on a row of its own. At phone width, cards. D62 §4.1: the Hops
 * view too, one group with no heading: variety, manufacturer, form, origin,
 * the typical alpha / beta / oil ranges ("11–13"), on hand and suppliers
 * with $/box. D65 §5.1: Fruits, Spices & Flavorings, Sugars and Extracts and
 * Other Consumables (grouped by child) the same way: ingredient,
 * manufacturer (None when blank), form, unit, on hand and suppliers with
 * $/pack.
 */
export default function GrainsList({ categoryKey = 'grains', children, products, grains, types, filters, mode, strainTypes }: GrainsListProps) {
  const navigate = useNavigate()
  const hops = categoryKey === 'hops'
  const grain = categoryKey === 'grains'
  // D65: any other managed category.
  const d65 = !hops && !grain
  // D64 §6.1: Yeast Strains: strain, lab, code, form, type, temp, attenuation.
  const yeast = categoryKey === 'yeast'
  const typeName = (id: number | null | undefined) => (id != null ? (strainTypes?.get(id) ?? '—') : '—')
  const specColumns = SPEC_COLUMNS[categoryKey] ?? []
  // Test ids and words by the category: grain-row-12, hop-row-12, product-row-12.
  const item = hops ? 'hop' : grain ? 'grain' : 'product'
  const extraColumns = yeast ? 3 : hops || d65 ? 2 : 0
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const decimals = useMemo(() => Object.fromEntries(types.map((t) => [t.key, t.decimals])), [types])

  const groups = useMemo(() => {
    const narrowed = !!filters.form || (filters.strainTypeId ?? '') !== ''
    const filtering = !!filters.search.trim() || filters.manufacturerId !== '' || filters.supplierId !== '' || filters.onHandOnly || narrowed
    const shownProducts = products.filter(
      (p) =>
        productMatches(p, filters.search) &&
        (filters.manufacturerId === '' || (p.manufacturer_party_id ?? NONE) === filters.manufacturerId) &&
        (filters.supplierId === '' || (p.offers ?? []).some((o) => o.supplier_party_id === filters.supplierId)) &&
        (!filters.onHandOnly || Number(p.on_hand) > 0) &&
        (!filters.form || p.form === filters.form) &&
        ((filters.strainTypeId ?? '') === '' || p.ingredient?.yeast_strain_type_id === filters.strainTypeId),
    )
    const withProducts = new Set(products.map((p) => p.ingredient_id))
    // A grain with no products shows only while nothing narrows the list but the search.
    const term = filters.search.trim().toLowerCase()
    const bare = grains.filter(
      (g) =>
        !withProducts.has(g.id) &&
        (!filtering || (term && !narrowed && filters.manufacturerId === '' && filters.supplierId === '' && !filters.onHandOnly && g.name.toLowerCase().includes(term))),
    )
    return children
      .filter((c) => filters.categoryId == null || c.id === filters.categoryId)
      .map((c) => {
        const rows: ({ kind: 'product'; product: IngredientProduct } | { kind: 'grain'; grain: Ingredient })[] = [
          ...shownProducts.filter((p) => p.ingredient?.category?.id === c.id).map((product) => ({ kind: 'product' as const, product })),
          ...bare.filter((g) => g.category_id === c.id).map((grain) => ({ kind: 'grain' as const, grain })),
        ]
        const name = (r: (typeof rows)[number]) => (r.kind === 'product' ? `${r.product.ingredient?.name} ${makerName(r.product)} ${r.product.form ?? ''}` : r.grain.name)
        rows.sort((a, b) => name(a).localeCompare(name(b)))
        return { category: c, rows }
      })
      .filter((g) => g.rows.length > 0)
  }, [children, products, grains, filters])

  const toggle = (id: number) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const spec = (p: IngredientProduct, key: string) =>
    RANGE_COLUMNS.has(key) ? (formatRange(p.features?.[key], { key, decimals: decimals[key] ?? 2 }) ?? '—') : formatFeature(p.features?.[key]?.value, { key, decimals: decimals[key] ?? 1 })
  const suppliers = (p: IngredientProduct) =>
    (p.offers ?? [])
      .filter((o) => o.active)
      // D65: packs differ by offer, so each price names its pack ("$45.00/pail").
      .map((o) => `${o.supplier?.name ?? '?'} ${o.current_price ? `${money(o.current_price.price_per_pack)}${d65 ? `/${o.pack_name}` : ''}` : '—'}`)
      .join(' · ') || '—'

  if (groups.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {hops ? 'No hops found' : grain ? 'No grains found' : 'No products found'}
        </Typography>
      </Paper>
    )
  }

  // Hops has no children: one group, no heading to collapse. D65: headings where there are children (Other Consumables).
  const headed = grain || (d65 && children.length > 1)
  const header = (g: (typeof groups)[number]) => (
    <Box
      onClick={() => toggle(g.category.id)}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', userSelect: 'none' }}
      data-testid={`grain-group-${g.category.name}`}
    >
      <IconButton size="small" aria-label={collapsed.has(g.category.id) ? `Show ${g.category.name}` : `Hide ${g.category.name}`}>
        {collapsed.has(g.category.id) ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </IconButton>
      <Typography variant="subtitle2">{g.category.name}</Typography>
      <Typography variant="caption" color="text.secondary">
        ({g.rows.length})
      </Typography>
    </Box>
  )

  if (phone) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="grains-cards">
        {groups.map((g) => (
          <Box key={g.category.id}>
            {headed && header(g)}
            {!collapsed.has(g.category.id) && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {g.rows.map((r) =>
                  r.kind === 'product' ? (
                    <Card key={`p${r.product.id}`} variant="outlined" data-testid={`${item}-card-${r.product.id}`}>
                      <CardActionArea onClick={() => navigate(`/ingredients/products/${r.product.id}`)}>
                        <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                          <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                            {r.product.display_name}
                          </Typography>
                          <Typography variant="body2">
                            {onHandText(r.product, mode)}
                            <BelowMinimum product={r.product} />
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {hops
                              ? hopCaption(r.product, decimals)
                              : yeast
                                ? [
                                    r.product.form,
                                    typeName(r.product.ingredient?.yeast_strain_type_id),
                                    spec(r.product, 'ferm_temp_f') !== '—' && `${spec(r.product, 'ferm_temp_f')} °F`,
                                    spec(r.product, 'attenuation_pct') !== '—' && `${spec(r.product, 'attenuation_pct')} % atten.`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                              : d65
                                ? [
                                    r.product.form,
                                    unitLabel(r.product),
                                    makerName(r.product),
                                    ...specColumns.filter((k) => spec(r.product, k) !== '—').map((k) => `${spec(r.product, k)} ${k === 'brix' ? '°Bx' : '% FGDB'}`),
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')
                                : `${spec(r.product, 'color_lovibond')} °L · ${spec(r.product, 'extract_fgdb')} % FGDB`}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ) : (
                    <Card key={`g${r.grain.id}`} variant="outlined">
                      <CardActionArea onClick={() => navigate(`/ingredients/${r.grain.id}`)}>
                        <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                          <Typography variant="body2" fontWeight={600}>
                            {r.grain.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {hops ? 'No hop products' : grain ? 'No maltster products' : 'No products'}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ),
                )}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    )
  }

  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" data-testid={hops ? 'hops-table' : grain ? 'grains-table' : 'products-table'}>
        <TableHead>
          <TableRow>
            <TableCell>{hops ? 'Variety' : grain ? 'Grain' : yeast ? 'Strain' : 'Ingredient'}</TableCell>
            <TableCell>{grain ? 'Maltster' : yeast ? 'Lab' : 'Manufacturer'}</TableCell>
            {yeast && <TableCell>Code</TableCell>}
            {(hops || d65) && <TableCell>Form</TableCell>}
            {hops && <TableCell>Origin</TableCell>}
            {d65 && !yeast && <TableCell>Unit</TableCell>}
            {yeast && <TableCell>Type</TableCell>}
            {specColumns.map((k) => (
              <TableCell key={k} align="right">
                {SHORT_LABELS[k]}
              </TableCell>
            ))}
            <TableCell align="right">On hand</TableCell>
            <TableCell>Suppliers ($/{hops ? 'box' : grain ? 'sack' : 'pack'})</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((g) => (
            <Fragment key={g.category.id}>
              {headed && (
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell colSpan={4 + extraColumns + specColumns.length} sx={{ py: 0.25 }}>
                    {header(g)}
                  </TableCell>
                </TableRow>
              )}
              {!collapsed.has(g.category.id) &&
                g.rows.map((r) =>
                  r.kind === 'product' ? (
                    <TableRow key={`p${r.product.id}`} hover sx={{ cursor: 'pointer', opacity: r.product.active ? 1 : 0.6 }} onClick={() => navigate(`/ingredients/products/${r.product.id}`)} data-testid={`${item}-row-${r.product.id}`}>
                      <TableCell>{r.product.ingredient?.name}</TableCell>
                      <TableCell>
                        {grain ? r.product.manufacturer?.name : makerName(r.product)}
                        {r.product.name && !yeast && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {r.product.name}
                          </Typography>
                        )}
                      </TableCell>
                      {yeast && <TableCell data-testid={`${item}-code-${r.product.id}`}>{r.product.name}</TableCell>}
                      {(hops || d65) && <TableCell>{r.product.form}</TableCell>}
                      {hops && <TableCell>{r.product.origin ?? '—'}</TableCell>}
                      {d65 && !yeast && <TableCell data-testid={`${item}-unit-${r.product.id}`}>{unitLabel(r.product)}</TableCell>}
                      {yeast && <TableCell data-testid={`${item}-type-${r.product.id}`}>{typeName(r.product.ingredient?.yeast_strain_type_id)}</TableCell>}
                      {specColumns.map((k) => (
                        <TableCell key={k} align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`${item}-${k}-${r.product.id}`}>
                          {spec(r.product, k)}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <span data-testid={`${item}-on-hand-${r.product.id}`}>{onHandText(r.product, mode)}</span>
                        <BelowMinimum product={r.product} />
                      </TableCell>
                      <TableCell>{suppliers(r.product)}</TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={`g${r.grain.id}`} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/ingredients/${r.grain.id}`)}>
                      <TableCell>{r.grain.name}</TableCell>
                      <TableCell colSpan={3 + extraColumns + specColumns.length}>
                        <Typography variant="body2" color="text.secondary">
                          {hops ? 'No hop products' : grain ? 'No maltster products' : 'No products'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ),
                )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </Paper>
  )
}

/** D61 §3.5: on hand (not expired) is under the product's minimum. */
/**
 * A hop card's caption: origin and each typical range that's set ("USA ·
 * α 11–13 % · β ≥ 4 % · oil 1.5–2.5"); a blank one is left out, not "β — %"
 * (D62 lead decisions 1, gap 2).
 */
function hopCaption(p: IngredientProduct, decimals: Record<string, number>): string {
  const range = (key: string) => formatRange(p.features?.[key], { key, decimals: decimals[key] ?? 2 })
  const alpha = range('alpha_acid_pct')
  const beta = range('beta_acid_pct')
  const oil = range('total_oil_ml_100g')
  return [p.origin, alpha && `α ${alpha} %`, beta && `β ${beta} %`, oil && `oil ${oil}`].filter(Boolean).join(' · ')
}

function BelowMinimum({ product }: { product: IngredientProduct }) {
  return product.below_minimum ? <Chip size="small" color="warning" label="Below minimum" sx={{ ml: 1 }} data-testid={`grain-below-minimum-${product.id}`} /> : null
}
