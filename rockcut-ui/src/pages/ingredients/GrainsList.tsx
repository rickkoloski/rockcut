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
import { onHandText, productMatches } from '../../lib/ingredientFeatures'
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
  children: IngredientCategory[]
  products: IngredientProduct[]
  grains: Ingredient[]
  types: FeatureType[]
  filters: GrainFilters
  mode: QuantityDisplay
}

const SPEC_COLUMNS = ['color_lovibond', 'extract_fgdb', 'diastatic_power_lintner', 'protein_pct', 'moisture_pct'] as const
const SHORT_LABELS: Record<string, string> = {
  color_lovibond: 'Color °L',
  extract_fgdb: 'Extract % FGDB',
  diastatic_power_lintner: 'DP °Lintner',
  protein_pct: 'Protein %',
  moisture_pct: 'Moisture %',
}

const money = (v: string) => `$${Number(v).toFixed(2)}`

/**
 * D60 §4.1: the Grains view of the Ingredient Library. Grouped by child
 * category (collapsible), one row per maltster product, a grain with no
 * products on a row of its own. At phone width, cards.
 */
export default function GrainsList({ children, products, grains, types, filters, mode }: GrainsListProps) {
  const navigate = useNavigate()
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

  const spec = (p: IngredientProduct, key: string) => formatFeature(p.features?.[key]?.value, decimals[key] ?? 1)
  const suppliers = (p: IngredientProduct) =>
    (p.offers ?? [])
      .filter((o) => o.active)
      .map((o) => `${o.supplier?.name ?? '?'} ${o.current_price ? money(o.current_price.price_per_pack) : '—'}`)
      .join(' · ') || '—'

  if (groups.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No grains found
        </Typography>
      </Paper>
    )
  }

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
            {header(g)}
            {!collapsed.has(g.category.id) && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {g.rows.map((r) =>
                  r.kind === 'product' ? (
                    <Card key={`p${r.product.id}`} variant="outlined" data-testid={`grain-card-${r.product.id}`}>
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
                            {spec(r.product, 'color_lovibond')} °L · {spec(r.product, 'extract_fgdb')} % FGDB
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
                            No maltster products
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
      <Table size="small" data-testid="grains-table">
        <TableHead>
          <TableRow>
            <TableCell>Grain</TableCell>
            <TableCell>Maltster</TableCell>
            {SPEC_COLUMNS.map((k) => (
              <TableCell key={k} align="right">
                {SHORT_LABELS[k]}
              </TableCell>
            ))}
            <TableCell align="right">On hand</TableCell>
            <TableCell>Suppliers ($/sack)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((g) => (
            <Fragment key={g.category.id}>
              <TableRow sx={{ backgroundColor: 'action.hover' }}>
                <TableCell colSpan={4 + SPEC_COLUMNS.length} sx={{ py: 0.25 }}>
                  {header(g)}
                </TableCell>
              </TableRow>
              {!collapsed.has(g.category.id) &&
                g.rows.map((r) =>
                  r.kind === 'product' ? (
                    <TableRow key={`p${r.product.id}`} hover sx={{ cursor: 'pointer', opacity: r.product.active ? 1 : 0.6 }} onClick={() => navigate(`/ingredients/products/${r.product.id}`)} data-testid={`grain-row-${r.product.id}`}>
                      <TableCell>{r.product.ingredient?.name}</TableCell>
                      <TableCell>
                        {r.product.manufacturer?.name}
                        {r.product.name && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {r.product.name}
                          </Typography>
                        )}
                      </TableCell>
                      {SPEC_COLUMNS.map((k) => (
                        <TableCell key={k} align="right">
                          {spec(r.product, k)}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <span data-testid={`grain-on-hand-${r.product.id}`}>{onHandText(r.product, mode)}</span>
                        <BelowMinimum product={r.product} />
                      </TableCell>
                      <TableCell>{suppliers(r.product)}</TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={`g${r.grain.id}`} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/ingredients/${r.grain.id}`)}>
                      <TableCell>{r.grain.name}</TableCell>
                      <TableCell colSpan={3 + SPEC_COLUMNS.length}>
                        <Typography variant="body2" color="text.secondary">
                          No maltster products
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
function BelowMinimum({ product }: { product: IngredientProduct }) {
  return product.below_minimum ? <Chip size="small" color="warning" label="Below minimum" sx={{ ml: 1 }} data-testid={`grain-below-minimum-${product.id}`} /> : null
}
