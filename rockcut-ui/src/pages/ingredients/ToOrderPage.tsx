import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  Link,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import PageHeader from '../../components/PageHeader'
import { PageToolbar } from '../../components/SettingsMenu'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiUpdate } from '../../hooks/useApiMutation'
import { GRAIN_KEYS } from '../../lib/inventory'
import parseApiError from '../../lib/parseApiError'
import { toOrder } from '../../lib/purchasing'
import type { IngredientProduct, ReorderRow, SupplierOffer } from '../../lib/types'
import OrderDialog from './OrderDialog'
import PurchasingTabs from './PurchasingTabs'

/** Shown from `sm` up; at phone width the figure goes under the product. */
const WIDE = { display: { xs: 'none', sm: 'table-cell' } }

/** One New order to start: a supplier and its lines (§4.3). */
interface Start {
  supplierId: number
  lines: { offerId: number; sacks: number; price: string | null }[]
}

/**
 * D61 §3.5, §4.3: the products with a minimum on hand: on hand (not
 * expired) in the reorder offer's sacks, the minimum, what's on order and
 * what to order. The offer can be changed per row (among the product's
 * active offers; To order follows its sack size) and the choice is saved
 * on the product (lead decisions 1, gap 4). Rows with something to order can
 * be picked: **Start an order** opens a prefilled New order per supplier,
 * one at a time. At phone width Minimum and On order go under the product
 * and the offer shows as supplier and sack size, wrapping, so To order stays
 * in view (gap 16).
 */
export default function ToOrderPage() {
  const { data: rows = [], isLoading } = useApiList<ReorderRow>(['ingredient_reorder'], '/api/ingredient_reorder')
  const { data: products = [] } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products')
  const [offerFor, setOfferFor] = useState<Record<number, number>>({})
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [queue, setQueue] = useState<Start[]>([])
  const [started, setStarted] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const saveOffer = useApiUpdate<IngredientProduct>((id) => `/api/ingredient_products/${id}`, { invalidateKeys: GRAIN_KEYS })

  const pickOffer = (productId: number, offerId: number, was: number) => {
    setOfferFor((m) => ({ ...m, [productId]: offerId }))
    saveOffer.mutate(
      { id: productId, reorder_offer_id: offerId },
      {
        onError: (err) => {
          setOfferFor((m) => ({ ...m, [productId]: was }))
          setError(parseApiError(err))
        },
      },
    )
  }

  const activeOffers = new Map(products.map((p) => [p.id, (p.offers ?? []).filter((o) => o.active)]))
  const view = rows.map((r) => {
    const offers = activeOffers.get(r.product_id) ?? (r.offer ? [r.offer] : [])
    const offer: SupplierOffer | null = offers.find((o) => o.id === offerFor[r.product_id]) ?? r.offer ?? null
    const figures = offer && r.on_hand_lb != null ? toOrder(r.min_on_hand_sacks, Number(r.on_hand_lb), Number(offer.sack_size_lb), r.on_order_sacks ?? 0) : null
    return { row: r, offers, offer, figures }
  })
  const orderable = view.filter((v) => v.figures && v.figures.toOrder > 0)
  const chosen = orderable.filter((v) => picked.has(v.row.product_id))

  const start = () => {
    const bySupplier = new Map<number, Start>()
    for (const v of chosen) {
      const s = bySupplier.get(v.offer!.supplier_party_id) ?? { supplierId: v.offer!.supplier_party_id, lines: [] }
      s.lines.push({ offerId: v.offer!.id, sacks: v.figures!.toOrder, price: v.offer!.current_price?.price_per_sack ?? null })
      bySupplier.set(s.supplierId, s)
    }
    const all = [...bySupplier.values()]
    setStarted(all.length)
    setQueue(all)
  }
  // The next supplier's order, saved or not; picks clear after the last.
  const next = () => {
    const rest = queue.slice(1)
    setQueue(rest)
    if (rest.length === 0) setPicked(new Set())
  }

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library', to: '/ingredients' }, { label: 'To order' }]} title="Purchasing" />
      <PurchasingTabs />
      <PageToolbar
        end={
          <Button variant="contained" disabled={chosen.length === 0} onClick={start} data-testid="to-order-start">
            Start an order{chosen.length > 0 ? ` (${chosen.length})` : ''}
          </Button>
        }
      >
        <Typography variant="body2" color="text.secondary">
          To order = minimum − on hand − on order, in whole sacks. Set a product&apos;s minimum on its page.
        </Typography>
      </PageToolbar>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ '& td, & th': { px: { xs: 1, sm: 2 } } }} data-testid="to-order-table">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Product</TableCell>
              <TableCell align="right">On hand</TableCell>
              <TableCell align="right" sx={WIDE}>
                Minimum
              </TableCell>
              <TableCell align="right" sx={WIDE}>
                On order
              </TableCell>
              <TableCell align="right">To order</TableCell>
              <TableCell>Offer</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary">
                    No product has a minimum on hand yet
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {view.map(({ row: r, offers, offer, figures }) => (
              <TableRow key={r.product_id} data-testid={`to-order-${r.product_id}`}>
                <TableCell padding="checkbox">
                  {figures && figures.toOrder > 0 && (
                    <Checkbox
                      checked={picked.has(r.product_id)}
                      onChange={(e) =>
                        setPicked((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(r.product_id)
                          else n.delete(r.product_id)
                          return n
                        })
                      }
                      slotProps={{ input: { 'aria-label': `Pick ${r.product.display_name}`, 'data-testid': `to-order-${r.product_id}-pick` } as object }}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Link component={RouterLink} to={`/ingredients/products/${r.product_id}`}>
                    {r.product.display_name}
                  </Link>
                  {r.below_minimum && <Chip size="small" color="warning" label="Below minimum" sx={{ ml: 1 }} />}
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ display: { xs: 'block', sm: 'none' } }}>
                    Minimum {r.min_on_hand_sacks} · on order {r.on_order_sacks ?? 0}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: { sm: 'nowrap' } }} data-testid={`to-order-${r.product_id}-on-hand`}>
                  {figures ? `${figures.onHandSacks} sacks` : `${Number(r.on_hand_lb ?? 0)} lb`}
                </TableCell>
                <TableCell align="right" sx={WIDE}>
                  {r.min_on_hand_sacks}
                </TableCell>
                <TableCell align="right" sx={WIDE} data-testid={`to-order-${r.product_id}-on-order`}>
                  {r.on_order_sacks ?? 0}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: figures && figures.toOrder > 0 ? 600 : undefined }} data-testid={`to-order-${r.product_id}-to-order`}>
                  {figures ? figures.toOrder : ''}
                </TableCell>
                <TableCell sx={{ minWidth: { xs: 140, sm: 200 }, maxWidth: { xs: 160, sm: 'none' } }}>
                  {offer ? (
                    <FormControl size="small" fullWidth>
                      <Select
                        value={offer.id}
                        onChange={(e) => pickOffer(r.product_id, Number(e.target.value), offer.id)}
                        inputProps={{ 'aria-label': 'Reorder offer' }}
                        renderValue={(id) => {
                          const o = offers.find((x) => x.id === id) ?? offer
                          return [o.supplier?.name, `${Number(o.sack_size_lb)} lb`].filter(Boolean).join(' · ')
                        }}
                        sx={{ '& .MuiSelect-select': { whiteSpace: 'normal' } }}
                        data-testid={`to-order-${r.product_id}-offer`}
                      >
                        {(offers.some((o) => o.id === offer.id) ? offers : [offer, ...offers]).map((o) => (
                          <MenuItem key={o.id} value={o.id}>
                            {[o.supplier?.name, o.order_name, `${Number(o.sack_size_lb)} lb`].filter(Boolean).join(' · ')}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Typography variant="body2" color="text.secondary" data-testid={`to-order-${r.product_id}-no-offer`}>
                      No offer
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Box>
        {queue.length > 0 && (
          <OrderDialog
            key={`${queue.length}-${queue[0].supplierId}`}
            open
            onClose={next}
            initial={queue[0]}
            titleNote={started > 1 ? `${started - queue.length + 1} of ${started}` : undefined}
          />
        )}
      </Box>
    </>
  )
}
