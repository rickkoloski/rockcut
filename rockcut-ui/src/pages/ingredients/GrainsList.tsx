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
import { formatRange, onHandText, productMatches } from '../../lib/ingredientFeatures'
import type { FeatureType, Ingredient, IngredientCategory, IngredientProduct } from '../../lib/types'

export interface GrainFilters {
  search: string
  /** One child category (Base, …), or all of Grains. */
  categoryId: number | null
  manufacturerId: number | ''
  supplierId: number | ''
  onHandOnly: boolean
}

interface GrainsListProps {
  /** D62: the category the list is of (`grains` or `hops`). */
  categoryKey?: 'grains' | 'hops'
  /** The groups: Grains' children; for hops, Hops itself (one group, no heading). */
  children: IngredientCategory[]
  products: IngredientProduct[]
  /** The category's ingredients (grains, hop varieties). */
  grains: Ingredient[]
  types: FeatureType[]
  filters: GrainFilters
  mode: QuantityDisplay
}

const SPEC_COLUMNS: Record<'grains' | 'hops', readonly string[]> = {
  grains: ['color_lovibond', 'extract_fgdb', 'diastatic_power_lintner', 'protein_pct', 'moisture_pct'],
  hops: ['alpha_acid_pct', 'beta_acid_pct', 'total_oil_ml_100g'],
}
const SHORT_LABELS: Record<string, string> = {
  color_lovibond: 'Color °L',
  extract_fgdb: 'Extract % FGDB',
  diastatic_power_lintner: 'DP °Lintner',
  protein_pct: 'Protein %',
  moisture_pct: 'Moisture %',
  alpha_acid_pct: 'Alpha %',
  beta_acid_pct: 'Beta %',
  total_oil_ml_100g: 'Oil mL/100 g',
}

const money = (v: string) => `$${Number(v).toFixed(2)}`

/**
 * D60 §4.1: the Grains view of the Ingredient Library. Grouped by child
 * category (collapsible), one row per maltster product, a grain with no
 * products on a row of its own. At phone width, cards. D62 §4.1: the Hops
 * view too, one group with no heading: variety, manufacturer, form, origin,
 * the typical alpha / beta / oil ranges ("11–13"), on hand and suppliers
 * with $/box.
 */
export default function GrainsList({ categoryKey = 'grains', children, products, grains, types, filters, mode }: GrainsListProps) {
  const navigate = useNavigate()
  const hops = categoryKey === 'hops'
  const specColumns = SPEC_COLUMNS[categoryKey]
  // Test ids and words by the category: grain-row-12, hop-row-12.
  const item = hops ? 'hop' : 'grain'
  const extraColumns = hops ? 2 : 0
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const decimals = useMemo(() => Object.fromEntries(types.map((t) => [t.key, t.decimals])), [types])

  const groups = useMemo(() => {
    const filtering = !!filters.search.trim() || filters.manufacturerId !== '' || filters.supplierId !== '' || filters.onHandOnly
    const shownProducts = products.filter(
      (p) =>
        productMatches(p, filters.search) &&
        (filters.manufacturerId === '' || p.manufacturer_party_id === filters.manufacturerId) &&
        (filters.supplierId === '' || (p.offers ?? []).some((o) => o.supplier_party_id === filters.supplierId)) &&
        (!filters.onHandOnly || Number(p.on_hand) > 0),
    )
    const withProducts = new Set(products.map((p) => p.ingredient_id))
    // A grain with no products shows only while nothing narrows the list but the search.
    const term = filters.search.trim().toLowerCase()
    const bare = grains.filter(
      (g) => !withProducts.has(g.id) && (!filtering || (term && filters.manufacturerId === '' && filters.supplierId === '' && !filters.onHandOnly && g.name.toLowerCase().includes(term))),
    )
    return children
      .filter((c) => filters.categoryId == null || c.id === filters.categoryId)
      .map((c) => {
        const rows: ({ kind: 'product'; product: IngredientProduct } | { kind: 'grain'; grain: Ingredient })[] = [
          ...shownProducts.filter((p) => p.ingredient?.category?.id === c.id).map((product) => ({ kind: 'product' as const, product })),
          ...bare.filter((g) => g.category_id === c.id).map((grain) => ({ kind: 'grain' as const, grain })),
        ]
        const name = (r: (typeof rows)[number]) => (r.kind === 'product' ? `${r.product.ingredient?.name} ${r.product.manufacturer?.name}` : r.grain.name)
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
    hops ? (formatRange(p.features?.[key], decimals[key] ?? 2) ?? '—') : formatFeature(p.features?.[key]?.value, decimals[key] ?? 1)
  const suppliers = (p: IngredientProduct) =>
    (p.offers ?? [])
      .filter((o) => o.active)
      .map((o) => `${o.supplier?.name ?? '?'} ${o.current_price ? money(o.current_price.price_per_pack) : '—'}`)
      .join(' · ') || '—'

  if (groups.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {hops ? 'No hops found' : 'No grains found'}
        </Typography>
      </Paper>
    )
  }

  // Hops has no children: one group, no heading to collapse.
  const headed = !hops
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
                            {hops ? 'No hop products' : 'No maltster products'}
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
      <Table size="small" data-testid={hops ? 'hops-table' : 'grains-table'}>
        <TableHead>
          <TableRow>
            <TableCell>{hops ? 'Variety' : 'Grain'}</TableCell>
            <TableCell>{hops ? 'Manufacturer' : 'Maltster'}</TableCell>
            {hops && <TableCell>Form</TableCell>}
            {hops && <TableCell>Origin</TableCell>}
            {specColumns.map((k) => (
              <TableCell key={k} align="right">
                {SHORT_LABELS[k]}
              </TableCell>
            ))}
            <TableCell align="right">On hand</TableCell>
            <TableCell>Suppliers ($/{hops ? 'box' : 'sack'})</TableCell>
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
                        {r.product.manufacturer?.name}
                        {r.product.name && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {r.product.name}
                          </Typography>
                        )}
                      </TableCell>
                      {hops && <TableCell>{r.product.form}</TableCell>}
                      {hops && <TableCell>{r.product.origin ?? '—'}</TableCell>}
                      {specColumns.map((k) => (
                        <TableCell key={k} align="right" sx={{ whiteSpace: 'nowrap' }}>
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
                          {hops ? 'No hop products' : 'No maltster products'}
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
  const range = (key: string) => formatRange(p.features?.[key], decimals[key] ?? 2)
  const alpha = range('alpha_acid_pct')
  const beta = range('beta_acid_pct')
  const oil = range('total_oil_ml_100g')
  return [p.origin, alpha && `α ${alpha} %`, beta && `β ${beta} %`, oil && `oil ${oil}`].filter(Boolean).join(' · ')
}

function BelowMinimum({ product }: { product: IngredientProduct }) {
  return product.below_minimum ? <Chip size="small" color="warning" label="Below minimum" sx={{ ml: 1 }} data-testid={`grain-below-minimum-${product.id}`} /> : null
}
