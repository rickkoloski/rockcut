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
import RemovePitchDialog from '../../components/RemovePitchDialog'
import StatusChip from '../../components/StatusChip'
import { useApiList, useApiQuery } from '../../hooks/useApiQuery'
import { useApiDelete } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import { enteredAs, formatFeature, formatQuantity, packLabel, packWord, productPack, packIsUnit, perUnitLabel } from '../../lib/brewingUnits'
import { applicability, differs, formatRange, ionsText, isD65Key, isRangeType, itemLabel, lotTypesFor, makerName, manufacturerLabel, onHandText, productLabel, productTypesFor, toggleLabels, typesFor, unitLabel } from '../../lib/ingredientFeatures'
import { GRAIN_KEYS, movementKindLabel } from '../../lib/inventory'
import { httpStatus, retryUnless404 } from '../../lib/notFound'
import parseApiError from '../../lib/parseApiError'
import { money as dollars, offerPackText } from '../../lib/purchasing'
import type { FeatureType, IngredientLot, IngredientProduct, InventoryMovement, OfferPrice, PurchaseOrder, SupplierOffer, YeastBatch } from '../../lib/types'
import ProductDialog from './ProductDialog'
import OfferDialog from './OfferDialog'
import PriceDialog from './PriceDialog'
import AddLotDialog from './AddLotDialog'
import GrainLotDialog from './GrainLotDialog'
import MovementDialog from './MovementDialog'
import CountDialog from './CountDialog'
import PitchDialog from './PitchDialog'
import { libraryHref } from '../../lib/libraryView'

const money = (v: string | number | null | undefined, digits = 2) => (v == null ? '—' : `$${Number(v).toFixed(digits)}`)

type Open = 'edit' | 'delete' | 'offer' | 'price' | 'lot' | 'movement' | 'count' | 'pitch' | null

/**
 * D60 §4.2: a product (a maltster's, for grain): its standard specs, supplier
 * offers and prices, lots, and stock movements. D62 §4.2: a hop product
 * shows its form, origin and typical ranges; its offers are box · 11 lb with
 * $/box and $/lb; its lots show crop year and the alpha / beta / oil actuals,
 * a value outside the typical range marked. D65 §5.2: a fruit, spice,
 * sugar or other consumable product as hops (offers with packs, lots,
 * movements, open orders, the minimum); its header shows form, unit
 * ("tablets" on a Tablet) and the manufacturer, or None.
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
  const [removingPitch, setRemovingPitch] = useState<InventoryMovement | null>(null)

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
  const remove = useApiDelete((pid) => `/api/ingredient_products/${pid}`, { invalidateKeys: GRAIN_KEYS, rowKey: (pid) => ['ingredient_product', pid] })
  // D64 §4.6: a yeast pitch names its batch; the movements say which.
  const yeastProduct = product?.category_key === 'yeast'
  const { data: batches = [] } = useApiList<YeastBatch>(['yeast_batches'], '/api/yeast/batches', undefined, { enabled: yeastProduct })
  const batchLabel = new Map(batches.map((b) => [b.id, b.label]))

  if (!product && httpStatus(error) === 404) {
    return <ItemNotFound what="Maltster product" backTo={libraryHref()} backLabel="Back to Ingredients" testId="product-not-found" />
  }
  if (!product && error) return <Alert severity="error">{parseApiError(error)}</Alert>
  if (!product) return <CircularProgress />

  const hops = product.category_key === 'hops'
  const key = product.category_key
  const d65 = isD65Key(key)
  // Hops and D65 products show their offers' packs by name ("pail · 5 gal").
  const named = hops || d65
  // D65: "tablets" for `each` on a Tablet product.
  const unit = unitLabel(product)
  // D64 §4.3: a feature for one form only (pitch size, Liquid yeast) shows on that form's products.
  const featureTypes = (named ? productTypesFor(types, product.category?.id, product.category?.parent_id) : typesFor(types, product.category?.id, product.category?.parent_id)).filter((t) => {
    const only = applicability(t, product.category?.id, product.category?.parent_id)?.only_form
    return !only || only === product.form
  })
  // D65: a lot's Brix (fruit, Liquid sugars) and extract (sugars) as columns; Brix only for its form.
  const lotTypes = named ? lotTypesFor(types, product.category?.id, product.category?.parent_id, product.form) : []
  const ranged = (t: FeatureType) => isRangeType(t, product.category?.id, product.category?.parent_id)
  // D65 §5.2: the standard extract (sugars) or the Brix range (fruit), shown in the header.
  const headerSpecs = d65
    ? featureTypes
        .map((t) => {
          const v = product.features?.[t.key]
          const shown = ranged(t) ? formatRange(v, t) : v ? formatFeature(v.value, t) : null
          return shown ? `${shown} ${t.unit_label}` : null
        })
        .filter(Boolean)
    : []
  const pack = productPack(product.offers, lots)
  // The pack the minimum counts in: the product's (a sack, for grain; a box, for hops).
  const minimumPack = pack?.name ?? product.offers?.[0]?.pack_name ?? (hops ? 'box' : d65 ? null : 'sack')
  const offerPack = product.offers?.[0]?.pack_name ?? minimumPack ?? 'pack'
  // D64 (gap 1): every offer and lot is one unit to the pack, so the pack and the unit say the same.
  const unitOffers = (product.offers ?? []).length > 0 && (product.offers ?? []).every((o) => packIsUnit(o.pack_name, o.pack_size, unit))
  const unitLots = lots.length > 0 && lots.every((l) => packIsUnit(l.pack_name, l.pack_size, unit))
  const unitPacks = (unitOffers || unitLots) && (unitOffers || !product.offers?.length) && (unitLots || !lots.length)
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
            {/* Gap 1: no toggle when every pack is the unit ("Bricks + bricks"). */}
            {!unitPacks && <QuantityToggle {...toggleLabels(minimumPack, unit)} />}
            <Button variant="contained" onClick={() => setOpen('movement')} disabled={lots.length === 0} data-testid="product-record-movement">
              Record movement
            </Button>
            <Button variant="outlined" onClick={() => setOpen('count')} disabled={lots.length === 0} data-testid="product-count">
              Count
            </Button>
            {/* D64 §6.4: pitch bricks or pitchables into a batch. */}
            {yeastProduct && (
              <Button variant="outlined" onClick={() => setOpen('pitch')} disabled={!(Number(product.on_hand) > 0)} data-testid="product-pitch">
                Pitch
              </Button>
            )}
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
              {hops
                ? [product.ingredient?.name, product.form, product.origin].filter(Boolean).join(' · ')
                : d65
                  ? [product.ingredient?.name, product.form, unit, product.category?.name, ...headerSpecs].filter(Boolean).join(' · ')
                  : `${product.ingredient?.name} · ${product.category?.name}`}
            </Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {manufacturerLabel(product.category_key)}
            </Typography>
            <Typography data-testid="product-manufacturer">
              {makerName(product)}
              {!product.active && <Chip label="Inactive" size="small" sx={{ ml: 1 }} />}
            </Typography>
          </Grid>
          {/* D65 (salts amendment): its ingredient's ions, read-only here (edited on the ingredient). */}
          {ionsText(product.ions) && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Ions (ppm @ 1 g/gal), from the ingredient
              </Typography>
              <Typography data-testid="product-ions">{ionsText(product.ions)}</Typography>
            </Grid>
          )}
          {product.notes && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary">
                {product.notes}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* D65: no features until Stop 2, so no empty section. */}
      {(!d65 || featureTypes.length > 0) && (
      <Section title={hops || (d65 && featureTypes.every(ranged)) ? 'Typical ranges' : 'Standard specs'} action={<Button onClick={() => setOpen('edit')}>Edit</Button>}>
        <Grid container spacing={2} sx={{ p: 2 }} data-testid="product-specs">
          {featureTypes.map((t) => {
            const v = product.features?.[t.key]
            const entered = enteredAs(v)
            const shown = hops || ranged(t) ? formatRange(v, t) : v ? formatFeature(v.value, t) : null
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
      )}

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
              <TableCell align="right">{named ? 'Pack' : `${offerPack.charAt(0).toUpperCase()}${offerPack.slice(1)}`}</TableCell>
              {!named && <TableCell>Form</TableCell>}
              <TableCell align="right">$/{offerPack}</TableCell>
              {!unitOffers && <TableCell align="right">$/{perUnitLabel(unit)}</TableCell>}
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
                    {named ? offerPackText(o, unit) : `${Number(o.pack_size)} ${unit}`}
                  </TableCell>
                  {!named && <TableCell>{o.form === 'milled' ? 'Milled' : 'Whole'}</TableCell>}
                  <TableCell align="right" data-testid={`offer-price-${o.id}`}>
                    {money(o.current_price?.price_per_pack)}
                  </TableCell>
                  {!unitOffers && <TableCell align="right">{money(o.current_price?.price_per_unit, 4)}</TableCell>}
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
                      <PriceHistory offer={o} unit={unit} />
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
              <TableCell align="right">$/{perUnitLabel(unit)}</TableCell>
              <TableCell align="right">Value</TableCell>
              <TableCell>Status</TableCell>
              {!named && <TableCell>Specs changed from standard</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {lots.length === 0 && (
              <TableRow>
                <TableCell colSpan={named ? 7 + (hops ? 1 : 0) + lotTypes.length : 8}>
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
                        title={outside ? `Outside typical ${formatRange(product.features?.[t.key], t)}` : undefined}
                        data-testid={`lot-${l.id}-${t.key}${outside ? '-outside' : ''}`}
                      >
                        {v != null ? formatFeature(v, t) : '—'}
                        {outside && ' ⚠'}
                      </TableCell>
                    )
                  })}
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`lot-on-hand-${l.id}`}>
                    {formatQuantity(l.on_hand, l.pack_name, l.pack_size, unit, mode)}
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
                  {!named && (
                  <TableCell>
                    {changed.map((t) => (
                      <Chip
                        key={t.key}
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ mr: 0.5, mb: 0.25 }}
                        label={`${t.label} ${formatFeature(l.features?.[t.key]?.value, t)}`}
                        title={`Standard: ${formatFeature(product.features?.[t.key]?.value, t)} ${t.unit_label}`}
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
                    : formatQuantity(m.quantity, lotsById.get(m.lot_id)?.pack_name, lotsById.get(m.lot_id)?.pack_size, unit, mode)}
                </TableCell>
                <TableCell>{m.partner?.name ?? ''}</TableCell>
                <TableCell data-testid={`movement-note-${m.id}`}>
                  {/* D64: a pitch names its batch, "→ Galactic #41". */}
                  {[m.batch_id != null ? `→ ${batchLabel.get(m.batch_id) ?? `batch #${m.batch_id}`}` : null, m.note].filter(Boolean).join(' · ')}
                </TableCell>
                <TableCell>
                  {m.entered_by?.name ?? ''}
                  {m.can_remove && (
                    <Button size="small" color="error" sx={{ ml: 1, minWidth: 0, py: 0 }} onClick={() => setRemovingPitch(m)} data-testid={`movement-remove-${m.id}`}>
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {removingPitch && (
        <RemovePitchDialog
          id={removingPitch.id}
          what={`${formatQuantity(Math.abs(Number(removingPitch.quantity)), null, null, unit, 'lb')}${removingPitch.batch_id != null ? ` into ${batchLabel.get(removingPitch.batch_id) ?? 'its batch'}` : ''}`}
          onClose={() => setRemovingPitch(null)}
        />
      )}
      <ProductDialog open={open === 'edit'} onClose={close} product={product} hasLots={lots.length > 0} />
      <ConfirmDialog
        open={open === 'delete'}
        onClose={close}
        onConfirm={handleDelete}
        title={`Delete ${productLabel(key).toLowerCase()}`}
        message={`Delete "${product.display_name}"? A product with offers or lots can't be deleted; make it inactive instead.`}
        loading={remove.isPending}
      />
      <OfferDialog
        open={open === 'offer'}
        onClose={close}
        productId={product.id}
        unit={unit}
        categoryKey={key}
        categoryId={product.category?.id}
        storedUnit={product.unit}
        productForm={product.form}
        offer={offer ?? undefined}
      />
      <PriceDialog open={open === 'price'} onClose={close} offer={offer} unit={unit} />
      <AddLotDialog open={open === 'lot' && lotId == null} onClose={close} product={product} />
      <GrainLotDialog open={open === 'lot' && !!lot} onClose={close} product={product} lot={lot} movements={lot ? movements.filter((m) => m.lot_id === lot.id) : []} />
      <MovementDialog open={open === 'movement'} onClose={close} product={product} lots={lots} />
      <CountDialog open={open === 'count'} onClose={close} product={product} lots={lots} />
      <PitchDialog open={open === 'pitch'} onClose={close} product={product} lots={lots} />
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
          {p.effective_on}: {money(p.price_per_pack)}/{offer.pack_name} · {money(p.price_per_unit, 4)}/{perUnitLabel(unit)}
          {p.id === offer.current_price?.id && ' (current)'}
          {p.note && ` · ${p.note}`}
          {p.entered_by && ` · ${p.entered_by.name}`}
        </Typography>
      ))}
    </Box>
  )
}
