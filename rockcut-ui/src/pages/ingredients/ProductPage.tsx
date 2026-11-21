import { Fragment, useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import HistoryIcon from '@mui/icons-material/History'
import AddIcon from '@mui/icons-material/Add'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import ItemNotFound from '../../components/ItemNotFound'
import QuantityToggle from '../../components/QuantityToggle'
import StatusChip from '../../components/StatusChip'
import { useApiList, useApiQuery } from '../../hooks/useApiQuery'
import { useApiDelete } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import { enteredAs, formatFeature, formatQuantity, packLabel, packWord, productPack } from '../../lib/brewingUnits'
import { differs, formatRange, itemLabel, lotTypesFor, manufacturerLabel, onHandText, productLabel, productTypesFor, toggleLabels, typesFor } from '../../lib/ingredientFeatures'
import { GRAIN_KEYS, movementKindLabel } from '../../lib/inventory'
import { httpStatus, retryUnless404 } from '../../lib/notFound'
import parseApiError from '../../lib/parseApiError'
import { money as dollars } from '../../lib/purchasing'
import type { FeatureType, IngredientLot, IngredientProduct, InventoryMovement, OfferPrice, PurchaseOrder, SupplierOffer } from '../../lib/types'
import ProductDialog from './ProductDialog'
import OfferDialog from './OfferDialog'
import PriceDialog from './PriceDialog'
import AddLotDialog from './AddLotDialog'
import GrainLotDialog from './GrainLotDialog'
import MovementDialog from './MovementDialog'
import CountDialog from './CountDialog'
import { libraryHref } from '../../lib/libraryView'

const money = (v: string | number | null | undefined, digits = 2) => (v == null ? '—' : `$${Number(v).toFixed(digits)}`)

type Open = 'edit' | 'delete' | 'offer' | 'price' | 'lot' | 'movement' | 'count' | null

/**
 * D60 §4.2: a product (a maltster's, for grain): its standard specs, supplier
 * offers and prices, lots, and stock movements. D62 §4.2: a hop product
 * shows its form, origin and typical ranges; its offers are box · 11 lb with
 * $/box and $/lb; its lots show crop year and the alpha / beta / oil actuals,
 * a value outside the typical range marked.
 */
export default function ProductPage() {
  const { id } = useParams()
  const productId = Number(id)
  const navigate = useNavigate()
  const { mode } = useQuantityDisplay()
  const [open, setOpen] = useState<Open>(null)
  const [offer, setOffer] = useState<SupplierOffer | null>(null)
  const [lotId, setLotId] = useState<number | null>(null)
  const [history, setHistory] = useState<Set<number>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: product, error } = useApiQuery<IngredientProduct>(['ingredient_product', productId], `/api/ingredient_products/${productId}`, undefined, {
    retry: retryUnless404,
  })
  const { data: types = [] } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  const { data: lots = [] } = useApiList<IngredientLot>(['ingredient_lots', { product_id: productId }], '/api/ingredient_lots', { product_id: productId })
  const { data: movements = [] } = useApiList<InventoryMovement>(['inventory_movements', { product_id: productId }], '/api/inventory_movements', {
    product_id: productId,
  })
  // Lead decisions 4: the open lot is read from the live list, so the dialog
  // follows a refetch (on-hand, `delete_blocked`) like its movements do.
  const lot = lotId == null ? null : (lots.find((l) => l.id === lotId) ?? null)
  // D61 §4.5: the open orders with a line of this product.
  const { data: openOrders = [] } = useApiList<PurchaseOrder>(['purchase_orders', { status: 'open' }], '/api/purchase_orders', { status: 'open' })
  const onOrder = openOrders
    .map((o) => ({ order: o, packs: o.lines.filter((l) => l.offer.product_id === productId).reduce((n, l) => n + l.packs_ordered, 0) }))
    .filter((x) => x.packs > 0)
  const remove = useApiDelete((pid) => `/api/ingredient_products/${pid}`, { invalidateKeys: GRAIN_KEYS })

  if (!product && httpStatus(error) === 404) {
    return <ItemNotFound what="Maltster product" backTo={libraryHref()} backLabel="Back to Ingredients" testId="product-not-found" />
  }
  if (!product && error) return <Alert severity="error">{parseApiError(error)}</Alert>
  if (!product) return <CircularProgress />

  const hops = product.category_key === 'hops'
  const key = product.category_key
  const featureTypes = hops ? productTypesFor(types, product.category?.id, product.category?.parent_id) : typesFor(types, product.category?.id, product.category?.parent_id)
  const lotTypes = hops ? lotTypesFor(types, product.category?.id, product.category?.parent_id) : []
  const pack = productPack(product.offers, lots)
  // The pack the minimum counts in: the product's (a sack, for grain; a box, for hops).
  const minimumPack = pack?.name ?? product.offers?.[0]?.pack_name ?? (hops ? 'box' : 'sack')
  const offerPack = product.offers?.[0]?.pack_name ?? minimumPack
  const lotsById = new Map(lots.map((l) => [l.id, l]))
  const close = () => {
    setOpen(null)
    setOffer(null)
    setLotId(null)
  }
  const toggleHistory = (offerId: number) =>
    setHistory((s) => {
      const next = new Set(s)
      if (next.has(offerId)) next.delete(offerId)
      else next.add(offerId)
      return next
    })

  const handleDelete = async () => {
    try {
      await remove.mutateAsync(product.id)
      navigate(libraryHref())
    } catch (err) {
      setOpen(null)
      setDeleteError(parseApiError(err))
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Ingredients', to: libraryHref() },
          { label: product.display_name },
        ]}
        title={product.display_name}
        toolbar={
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <QuantityToggle {...toggleLabels(minimumPack, product.unit)} />
            <Button variant="contained" onClick={() => setOpen('movement')} disabled={lots.length === 0} data-testid="product-record-movement">
              Record movement
            </Button>
            <Button variant="outlined" onClick={() => setOpen('count')} disabled={lots.length === 0} data-testid="product-count">
              Count
            </Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setOpen('lot')} data-testid="product-add-lot">
              Add lot
            </Button>
            <Tooltip title={`Edit ${productLabel(key).toLowerCase()}`}>
              <IconButton onClick={() => setOpen('edit')} aria-label={`Edit ${productLabel(key).toLowerCase()}`} data-testid="product-edit">
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={`Delete ${productLabel(key).toLowerCase()}`}>
              <IconButton onClick={() => setOpen('delete')} color="error" aria-label={`Delete ${productLabel(key).toLowerCase()}`}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        }
      />

      {/* Gap 5: the top bar cuts a long name at phone width; the whole name goes here. */}
      <Typography variant="h6" component="p" sx={{ display: { xs: 'block', sm: 'none' }, mb: 1, overflowWrap: 'anywhere' }} data-testid="product-name">
        {product.display_name}
      </Typography>

      {deleteError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDeleteError(null)}>
          {deleteError}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="subtitle2" color="text.secondary">
              On hand
            </Typography>
            <Typography variant="h6" data-testid="product-on-hand">
              {onHandText(product, mode, pack)}
            </Typography>
            {/* D61 §3.5: the minimum and the mark when on hand (not expired) is under it. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {product.below_minimum && <Chip size="small" color="warning" label="Below minimum" data-testid="product-below-minimum" />}
              <Typography variant="body2" color="text.secondary" data-testid="product-minimum-text">
                Minimum: {product.min_on_hand_packs != null ? `${product.min_on_hand_packs} ${packWord(minimumPack, product.min_on_hand_packs)}` : 'none'}
              </Typography>
              <Button size="small" onClick={() => setOpen('edit')} data-testid="product-minimum-edit">
                {product.min_on_hand_packs != null ? 'Change' : 'Set'}
              </Button>
            </Box>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {itemLabel(key)}
            </Typography>
            <Typography data-testid="product-item">
              {hops ? [product.ingredient?.name, product.form, product.origin].filter(Boolean).join(' · ') : `${product.ingredient?.name} · ${product.category?.name}`}
            </Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {manufacturerLabel(product.category_key)}
            </Typography>
            <Typography>
              {product.manufacturer?.name}
              {!product.active && <Chip label="Inactive" size="small" sx={{ ml: 1 }} />}
            </Typography>
          </Grid>
          {product.notes && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary">
                {product.notes}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      <Section title={hops ? 'Typical ranges' : 'Standard specs'} action={<Button onClick={() => setOpen('edit')}>Edit</Button>}>
        <Grid container spacing={2} sx={{ p: 2 }} data-testid="product-specs">
          {featureTypes.map((t) => {
            const v = product.features?.[t.key]
            const entered = enteredAs(v)
            const shown = hops ? formatRange(v, t.decimals) : v ? formatFeature(v.value, t.decimals) : null
            return (
              <Grid key={t.key} size={{ xs: 6, sm: 4, md: 2.4 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  {t.label}
                </Typography>
                <Typography data-testid={`product-spec-${t.key}`}>{shown ? `${shown} ${t.unit_label}` : '—'}</Typography>
                {entered && (
                  <Typography variant="caption" color="text.secondary" data-testid={`product-spec-${t.key}-entered`}>
                    {entered}
                  </Typography>
                )}
              </Grid>
            )
          })}
        </Grid>
      </Section>

      <Section
        title="Supplier offers"
        action={
          <Button startIcon={<AddIcon />} onClick={() => setOpen('offer')} data-testid="product-add-offer">
            Add offer
          </Button>
        }
      >
        <Table size="small" data-testid="product-offers">
          <TableHead>
            <TableRow>
              <TableCell>Supplier</TableCell>
              <TableCell>Order name</TableCell>
              <TableCell align="right">{hops ? 'Pack' : `${offerPack.charAt(0).toUpperCase()}${offerPack.slice(1)}`}</TableCell>
              {!hops && <TableCell>Form</TableCell>}
              <TableCell align="right">$/{offerPack}</TableCell>
              <TableCell align="right">$/{product.unit}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {(product.offers ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary">
                    No offers yet
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {(product.offers ?? []).map((o) => (
              <Fragment key={o.id}>
                <TableRow sx={{ opacity: o.active ? 1 : 0.6 }} data-testid={`offer-row-${o.id}`}>
                  <TableCell>{o.supplier?.name}</TableCell>
                  <TableCell>{o.order_name ?? '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`offer-pack-${o.id}`}>
                    {hops ? `${o.pack_name} · ${Number(o.pack_size)} ${product.unit}` : `${Number(o.pack_size)} ${product.unit}`}
                  </TableCell>
                  {!hops && <TableCell>{o.form === 'milled' ? 'Milled' : 'Whole'}</TableCell>}
                  <TableCell align="right" data-testid={`offer-price-${o.id}`}>
                    {money(o.current_price?.price_per_pack)}
                  </TableCell>
                  <TableCell align="right">{money(o.current_price?.price_per_unit, 4)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Button
                      size="small"
                      onClick={() => {
                        setOffer(o)
                        setOpen('price')
                      }}
                      data-testid={`offer-add-price-${o.id}`}
                    >
                      Add price
                    </Button>
                    <Tooltip title="Price history">
                      <IconButton size="small" onClick={() => toggleHistory(o.id)} aria-label="Price history" data-testid={`offer-history-${o.id}`}>
                        <HistoryIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit offer">
                      <IconButton
                        size="small"
                        aria-label="Edit offer"
                        onClick={() => {
                          setOffer(o)
                          setOpen('offer')
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                {history.has(o.id) && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ backgroundColor: 'action.hover' }}>
                      <PriceHistory offer={o} unit={product.unit} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Lots">
        <Table size="small" data-testid="product-lots">
          <TableHead>
            <TableRow>
              <TableCell>Lot #</TableCell>
              <TableCell>Received</TableCell>
              <TableCell>Supplier</TableCell>
              {hops && <TableCell align="right">Crop year</TableCell>}
              {lotTypes.map((t) => (
                <TableCell key={t.key} align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {t.label} {t.unit_label}
                </TableCell>
              ))}
              <TableCell align="right">On hand</TableCell>
              <TableCell align="right">$/{product.unit}</TableCell>
              <TableCell align="right">Value</TableCell>
              <TableCell>Status</TableCell>
              {!hops && <TableCell>Specs changed from standard</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {lots.length === 0 && (
              <TableRow>
                <TableCell colSpan={hops ? 8 + lotTypes.length : 8}>
                  <Typography variant="body2" color="text.secondary">
                    No lots yet: Add lot enters stock that's here or just arrived.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {lots.map((l) => {
              const changed = featureTypes.filter((t) => differs(l.features?.[t.key], product.features?.[t.key], t.decimals))
              return (
                <TableRow
                  key={l.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => {
                    setLotId(l.id)
                    setOpen('lot')
                  }}
                  data-testid={`lot-row-${l.id}`}
                >
                  <TableCell>{l.lot_number ?? '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{l.received_date ?? '—'}</TableCell>
                  <TableCell>{l.supplier?.name ?? '—'}</TableCell>
                  {hops && (
                    <TableCell align="right" data-testid={`lot-crop-year-${l.id}`}>
                      {l.crop_year ?? '—'}
                    </TableCell>
                  )}
                  {lotTypes.map((t) => {
                    // D62 §3.4: outside the product's typical range is marked, never refused.
                    const outside = (l.outside_range ?? []).includes(t.key)
                    const v = l.features?.[t.key]?.value
                    return (
                      <TableCell
                        key={t.key}
                        align="right"
                        sx={outside ? { color: 'warning.main', fontWeight: 600 } : undefined}
                        title={outside ? `Outside typical ${formatRange(product.features?.[t.key], t.decimals)}` : undefined}
                        data-testid={`lot-${l.id}-${t.key}${outside ? '-outside' : ''}`}
                      >
                        {v != null ? formatFeature(v, t.decimals) : '—'}
                        {outside && ' ⚠'}
                      </TableCell>
                    )
                  })}
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`lot-on-hand-${l.id}`}>
                    {formatQuantity(l.on_hand, l.pack_name, l.pack_size, product.unit, mode)}
                  </TableCell>
                  {/* D61 §3.4: at the latest price paid; "est." at the offer price; "—" with no price. */}
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`lot-cost-${l.id}`}>
                    {l.unvalued ? '—' : dollars(l.unit_cost, 4)}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`lot-value-${l.id}`}>
                    {l.unvalued ? '—' : `${dollars(l.value)}${l.estimated ? ' est.' : ''}`}
                  </TableCell>
                  <TableCell data-testid={`lot-status-${l.id}`}>
                    <StatusChip status={l.status} domain="lot" />
                  </TableCell>
                  {!hops && (
                  <TableCell>
                    {changed.map((t) => (
                      <Chip
                        key={t.key}
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ mr: 0.5, mb: 0.25 }}
                        label={`${t.label} ${formatFeature(l.features?.[t.key]?.value, t.decimals)}`}
                        title={`Standard: ${formatFeature(product.features?.[t.key]?.value, t.decimals)} ${t.unit_label}`}
                        data-testid={`lot-${l.id}-changed-${t.key}`}
                      />
                    ))}
                  </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Section>

      <Section title="Open orders">
        <Table size="small" data-testid="product-open-orders">
          <TableHead>
            <TableRow>
              <TableCell>Ordered</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell align="right">{packLabel(offerPack)}</TableCell>
              <TableCell>Expected</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {onOrder.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">
                    None on order
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {onOrder.map(({ order: o, packs }) => (
              <TableRow key={o.id} data-testid={`product-open-order-${o.id}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Link component={RouterLink} to={`/ingredients/orders/${o.id}`}>
                    {o.ordered_on}
                  </Link>
                </TableCell>
                <TableCell>{o.supplier?.name}</TableCell>
                <TableCell align="right">{packs}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{o.expected_on ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Movements">
        <Table size="small" data-testid="product-movements">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Lot</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell>Partner</TableCell>
              <TableCell>Note</TableCell>
              <TableCell>Who</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {movements.length === 0 && (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary">
                    No movements yet
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {movements.map((m) => (
              <TableRow key={m.id} data-testid={`movement-row-${m.id}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{m.occurred_on}</TableCell>
                <TableCell data-testid={`movement-kind-${m.id}`}>{movementKindLabel(m)}</TableCell>
                <TableCell>{m.lot_number ?? `#${m.lot_id}`}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {Number(m.quantity) === 0
                    ? '—'
                    : formatQuantity(m.quantity, lotsById.get(m.lot_id)?.pack_name, lotsById.get(m.lot_id)?.pack_size, product.unit, mode)}
                </TableCell>
                <TableCell>{m.partner?.name ?? ''}</TableCell>
                <TableCell>{m.note ?? ''}</TableCell>
                <TableCell>{m.entered_by?.name ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <ProductDialog open={open === 'edit'} onClose={close} product={product} />
      <ConfirmDialog
        open={open === 'delete'}
        onClose={close}
        onConfirm={handleDelete}
        title={`Delete ${productLabel(key).toLowerCase()}`}
        message={`Delete "${product.display_name}"? A product with offers or lots can't be deleted; make it inactive instead.`}
        loading={remove.isPending}
      />
      <OfferDialog open={open === 'offer'} onClose={close} productId={product.id} unit={product.unit} categoryKey={key} offer={offer ?? undefined} />
      <PriceDialog open={open === 'price'} onClose={close} offer={offer} unit={product.unit} />
      <AddLotDialog open={open === 'lot' && lotId == null} onClose={close} product={product} />
      <GrainLotDialog open={open === 'lot' && !!lot} onClose={close} product={product} lot={lot} movements={lot ? movements.filter((m) => m.lot_id === lot.id) : []} />
      <MovementDialog open={open === 'movement'} onClose={close} product={product} lots={lots} />
      <CountDialog open={open === 'count'} onClose={close} product={product} lots={lots} />
    </>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">{title}</Typography>
        {action}
      </Box>
      {/* Wide tables scroll inside their box at phone width, never the page. */}
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        {children}
      </Paper>
    </Box>
  )
}

/** An offer's prices, newest first, with $/lb. */
function PriceHistory({ offer, unit }: { offer: SupplierOffer; unit: string }) {
  const { data: prices = [], isLoading } = useApiList<OfferPrice>(['offer_prices', offer.id], `/api/supplier_offers/${offer.id}/prices`)
  if (isLoading) return <CircularProgress size={20} />
  if (prices.length === 0)
    return (
      <Typography variant="body2" color="text.secondary">
        No prices yet
      </Typography>
    )
  return (
    <Box data-testid={`price-history-${offer.id}`}>
      {prices.map((p) => (
        <Typography key={p.id} variant="body2" data-testid="price-history-row">
          {p.effective_on}: {money(p.price_per_pack)}/{offer.pack_name} · {money(p.price_per_unit, 4)}/{unit}
          {p.id === offer.current_price?.id && ' (current)'}
          {p.note && ` · ${p.note}`}
          {p.entered_by && ` · ${p.entered_by.name}`}
        </Typography>
      ))}
    </Box>
  )
}
