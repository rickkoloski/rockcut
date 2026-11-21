import { Fragment, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  useMediaQuery,
  useTheme,
} from '@mui/material'
import PageHeader from '../../components/PageHeader'
import { PageToolbar } from '../../components/SettingsMenu'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiUpdate } from '../../hooks/useApiMutation'
import { GRAIN_KEYS, refreshAfterConflict } from '../../lib/inventory'
import parseApiError from '../../lib/parseApiError'
import { httpStatus } from '../../lib/notFound'
import { amountText, packsFigure, reorderListPack, reorderOfferPack, toOrder } from '../../lib/purchasing'
import { packPlural } from '../../lib/brewingUnits'
import type { IngredientProduct, ReorderRow, SupplierOffer } from '../../lib/types'
import OrderDialog from './OrderDialog'
import PurchasingTabs from './PurchasingTabs'

/** Shown from `sm` up; at phone width the figure goes under the product. */
const WIDE = { display: { xs: 'none', sm: 'table-cell' } }

/** One New order to start: a supplier and its lines (§4.3). */
interface Start {
  supplierId: number
  lines: { offerId: number; packs: number; price: string | null }[]
}

/**
 * D61 §3.5, §4.3: the products with a minimum on hand: on hand (not
 * expired) in the reorder offer's packs (D62 §3.5: sacks for grain), the
 * minimum, what's on order and what to order. The offer can be changed per
 * row (among the product's active offers; To order follows its pack size)
 * and the choice is saved
 * on the product (lead decisions 1, gap 4). Rows with something to order can
 * be picked: **Start an order** opens a prefilled New order per supplier,
 * one at a time. At phone width Minimum and On order go under the product
 * and the offer gets a row of its own under the product, the whole width
 * of the table, its supplier and pack size wrapping, so the row fits with no
 * sideways scroll and the pack size is readable (gaps 16, 19).
 */
export default function ToOrderPage() {
  const { data: rows = [], isLoading } = useApiList<ReorderRow>(['ingredient_reorder'], '/api/ingredient_reorder')
  const { data: products = [] } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products')
  const [offerFor, setOfferFor] = useState<Record<number, number>>({})
  const [saved, setSaved] = useState<Record<number, number>>({})
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [queue, setQueue] = useState<Start[]>([])
  const [started, setStarted] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Decisions 4: rows refetching after a 409; their picker waits for the current version.
  const [refreshing, setRefreshing] = useState<Set<number>>(new Set())
  const narrow = useMediaQuery(useTheme().breakpoints.down('sm'))
  const qc = useQueryClient()
  const saveOffer = useApiUpdate<IngredientProduct>((id) => `/api/ingredient_products/${id}`, { invalidateKeys: GRAIN_KEYS })

  const pickOffer = (productId: number, offerId: number, was: number) => {
    // Decisions 3, gap 19: a new pick clears the last message (the 409's too).
    setError(null)
    setOfferFor((m) => ({ ...m, [productId]: offerId }))
    saveOffer.mutate(
      // D62 lead decisions 1, gap 9: every product save carries the version it
      // read, or the one this page's last save returned when the list is behind.
      { id: productId, reorder_offer_id: offerId, lock_version: Math.max(saved[productId] ?? 0, products.find((p) => p.id === productId)?.lock_version ?? 0) },
      {
        onSuccess: (p) => setSaved((m) => ({ ...m, [p.id]: p.lock_version })),
        onError: (err) => {
          // Decisions 2, gap 17: there's no dialog to reopen here, so a 409
          // refetches the rows (the version becomes current) and the picker
          // goes back to the saved offer; the next pick saves. Decisions 4:
          // the picker is disabled until the refetch lands, and only then
          // does the message say the list is up to date.
          if (httpStatus(err) === 409) {
            setRefreshing((s) => new Set(s).add(productId))
            void refreshAfterConflict(qc).then(() => {
              setOfferFor((m) => {
                const rest = { ...m }
                delete rest[productId]
                return rest
              })
              setRefreshing((s) => {
                const rest = new Set(s)
                rest.delete(productId)
                return rest
              })
              setError('Someone else changed this product. The list is up to date now; pick the offer again.')
            })
            return
          }
          setOfferFor((m) => ({ ...m, [productId]: was }))
          setError(parseApiError(err))
        },
      },
    )
  }

  const activeOffers = new Map(products.map((p) => [p.id, (p.offers ?? []).filter((o) => o.active)]))
  const units = new Map(products.map((p) => [p.id, p.unit]))
  const unitOf = (productId: number) => units.get(productId) ?? 'lb'
  const view = rows.map((r) => {
    const offers = activeOffers.get(r.product_id) ?? (r.offer ? [r.offer] : [])
    const offer: SupplierOffer | null = offers.find((o) => o.id === offerFor[r.product_id]) ?? r.offer ?? null
    const figures = offer && r.on_hand != null ? toOrder(r.min_on_hand_packs, Number(r.on_hand), Number(offer.pack_size), Number(r.on_order ?? 0)) : null
    return { row: r, offers, offer, figures }
  })
  const offerPicker = (productId: number, offers: SupplierOffer[], offer: SupplierOffer | null) =>
    offer ? (
      <FormControl size="small" fullWidth>
        <Select
          value={offer.id}
          onChange={(e) => pickOffer(productId, Number(e.target.value), offer.id)}
          disabled={refreshing.has(productId)}
          inputProps={{ 'aria-label': 'Reorder offer' }}
          renderValue={(id) => {
            const o = offers.find((x) => x.id === id) ?? offer
            return [o.supplier?.name, reorderOfferPack(o, unitOf(productId))].filter(Boolean).join(' · ')
          }}
          // Doubled class to outrank MUI's nowrap: the offer wraps, never cut (gap 19).
          sx={{ '& .MuiSelect-select.MuiSelect-select': { whiteSpace: 'normal', overflowWrap: 'anywhere' } }}
          data-testid={`to-order-${productId}-offer`}
        >
          {(offers.some((o) => o.id === offer.id) ? offers : [offer, ...offers]).map((o) => (
            <MenuItem key={o.id} value={o.id}>
              {[o.supplier?.name, o.order_name, reorderOfferPack(o, unitOf(productId))].filter(Boolean).join(' · ')}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    ) : (
      <Typography variant="body2" color="text.secondary" data-testid={`to-order-${productId}-no-offer`}>
        No offer
      </Typography>
    )

  // "sacks" while every row is grain, "boxes" while every row is hops; "packs" once they differ (gap 15).
  const keys = new Map(products.map((p) => [p.id, p.category_key]))
  const rowPack = (v: (typeof view)[number]) => {
    if (v.offer) return v.offer.pack_name
    const key = keys.get(v.row.product_id)
    return key === 'hops' ? 'box' : key === 'grains' ? 'sack' : null
  }
  const listPack = reorderListPack(view.map(rowPack))
  const orderable = view.filter((v) => v.figures && v.figures.toOrder > 0)
  const chosen = orderable.filter((v) => picked.has(v.row.product_id))

  const start = () => {
    const bySupplier = new Map<number, Start>()
    for (const v of chosen) {
      const s = bySupplier.get(v.offer!.supplier_party_id) ?? { supplierId: v.offer!.supplier_party_id, lines: [] }
      s.lines.push({ offerId: v.offer!.id, packs: v.figures!.toOrder, price: v.offer!.current_price?.price_per_pack ?? null })
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
          To order = minimum − on hand − on order, in whole {packPlural(listPack)}. Set a product&apos;s minimum
          on its page.
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
              {!narrow && <TableCell>Offer</TableCell>}
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
              <Fragment key={r.product_id}>
                <TableRow data-testid={`to-order-${r.product_id}`} sx={narrow ? { '& td': { borderBottom: 0 } } : undefined}>
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
                      Minimum {r.min_on_hand_packs} · on order {figures ? packsFigure(figures.onOrderPacks) : (r.on_order_packs ?? 0)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: { sm: 'nowrap' } }} data-testid={`to-order-${r.product_id}-on-hand`}>
                    {/* D62 lead decisions 1, gap 12: nothing on hand reads as the product page does ("0 lb"), not "0 boxes". */}
                    {figures && figures.onHandPacks > 0 ? `${figures.onHandPacks} ${packPlural(offer?.pack_name)}` : amountText(r.on_hand ?? 0, unitOf(r.product_id))}
                  </TableCell>
                  <TableCell align="right" sx={WIDE}>
                    {r.min_on_hand_packs}
                  </TableCell>
                  <TableCell align="right" sx={WIDE} data-testid={`to-order-${r.product_id}-on-order`}>
                    {figures ? packsFigure(figures.onOrderPacks) : (r.on_order_packs ?? 0)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: figures && figures.toOrder > 0 ? 600 : undefined }} data-testid={`to-order-${r.product_id}-to-order`}>
                    {figures ? figures.toOrder : ''}
                  </TableCell>
                  {!narrow && <TableCell sx={{ minWidth: 200 }}>{offerPicker(r.product_id, offers, offer)}</TableCell>}
                </TableRow>
                {narrow && (
                  <TableRow data-testid={`to-order-${r.product_id}-offer-row`}>
                    <TableCell colSpan={4} sx={{ pt: 0 }}>
                      {offerPicker(r.product_id, offers, offer)}
                    </TableCell>
                  </TableRow>
                )}
            </Fragment>
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
