import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Box, Button, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Select, Switch, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import { httpStatus } from '../../lib/notFound'
import parseApiError from '../../lib/parseApiError'
import { PRICE_DECIMALS, packLabel, packPlural, packSizeText, parseDecimal } from '../../lib/brewingUnits'
import { FUTURE_DATE, ORDER_KEYS } from '../../lib/inventory'
import { offerPackText, parsePacks, runningTotal, sharedPackName, targetProgress } from '../../lib/purchasing'
import { WRAP_ITEM, WRAP_SELECT, pickerName, unitLabel } from '../../lib/ingredientFeatures'
import { coloradoToday } from '../../lib/tasks'
import type { IngredientProduct, Party, PurchaseOrder, SupplierOffer } from '../../lib/types'

interface OrderDialogProps {
  open: boolean
  onClose: () => void
  /** The open order to change; none for a new order. */
  order?: PurchaseOrder
  onSaved?: (order: PurchaseOrder) => void
  /** A new order started from To order (§4.3): its supplier and lines. */
  initial?: { supplierId: number; lines: { offerId: number; packs: number; price: string | null }[] }
  /** Added to the title ("1 of 2" when To order starts several). */
  titleNote?: string
}

/**
 * D61 §3.2, §4.1: a new order or a change to an open one. A supplier, the
 * order date (today by default, never after it), expected date, reference,
 * off-contract and notes; lines of that supplier's active offers in whole
 * packs at a price per pack (D62 §3.5: sacks for grain; the current price
 * filled in), and a running
 * total with the progress to the supplier's order target. Placed when saved
 * (decision 42). Full screen at phone width.
 */
export default function OrderDialog({ open, ...props }: OrderDialogProps) {
  return open ? <OrderForm {...props} /> : null
}

interface Line {
  key: number
  id?: number
  offerId: number | ''
  packs: string
  price: string
}

const wholePacks = (packName: string | null | undefined) => `Whole ${packPlural(packName)}, 1 or more`

// React keys for lines: unique for the page's life.
let lineKeys = 0
const newLine = (): Line => ({ key: lineKeys++, offerId: '', packs: '', price: '' })

function OrderForm({ onClose, order, onSaved, initial, titleNote }: Omit<OrderDialogProps, 'open'>) {
  const [supplierId, setSupplierId] = useState<number | ''>(order?.supplier_party_id ?? initial?.supplierId ?? '')
  const [orderedOn, setOrderedOn] = useState(order?.ordered_on ?? coloradoToday())
  const [expectedOn, setExpectedOn] = useState(order?.expected_on ?? '')
  const [reference, setReference] = useState(order?.reference ?? '')
  const [offContract, setOffContract] = useState(order?.off_contract ?? false)
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [lines, setLines] = useState<Line[]>(() =>
    order
      ? order.lines.map((l) => ({ key: lineKeys++, id: l.id, offerId: l.offer_id, packs: String(l.packs_ordered), price: String(Number(l.price_per_pack)) }))
      : initial
        ? initial.lines.map((l) => ({ key: lineKeys++, offerId: l.offerId, packs: String(l.packs), price: l.price != null ? String(Number(l.price)) : '' }))
        : [newLine()],
  )
  const [error, setError] = useState<string | null>(null)
  // Lead decisions 2 (gap 1): the version this dialog opened, kept if the page
  // refetches under it, so a save over someone else's change stays refused.
  const [version] = useState(order?.lock_version)
  const qc = useQueryClient()

  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  const { data: offers = [], isLoading: offersLoading } = useApiList<SupplierOffer>(['supplier_offers', { supplier_id: supplierId }], '/api/supplier_offers', supplierId === '' ? undefined : { supplier_id: supplierId }, {
    enabled: supplierId !== '',
  })
  const { data: products = [], isLoading: productsLoading } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products')
  // Lead decisions 2 (item 7): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = partiesLoading || offersLoading || productsLoading
  const create = useApiCreate<PurchaseOrder>('/api/purchase_orders', { invalidateKeys: ORDER_KEYS })
  const update = useApiUpdate<PurchaseOrder>((id) => `/api/purchase_orders/${id}`, { invalidateKeys: ORDER_KEYS })

  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === order?.supplier_party_id))
  const supplier = parties.find((p) => p.id === supplierId)
  const productName = new Map(products.map((p) => [p.id, p.display_name]))
  const pickerNames = new Map(products.map((p) => [p.id, pickerName(p)]))
  // D65: "tablets" for `each` on a Tablet product.
  const productUnit = new Map(products.map((p) => [p.id, unitLabel(p)]))
  // A line already on an inactive offer keeps it (lead, Stop 2 note 7); new picks are active offers only.
  const kept = new Set(order?.lines.map((l) => l.offer_id) ?? [])
  const choices = offers.filter((o) => o.supplier_party_id === supplierId && (o.active || kept.has(o.id)))
  const offerById = new Map(offers.map((o) => [o.id, o]))
  // Gap 8: a hop offer leads with its variety and form ("Citra T90 Pellet · Yakima Chief Hops · box · 11 lb");
  // a grain offer reads as D61 ("Rahr - Standard 2-row · Rahr 2-Row · 55 lb · whole").
  const label = (o: SupplierOffer) => {
    const unit = productUnit.get(o.product_id) ?? 'lb'
    // D65: any pack but grain's sack reads as hops do ("Whirlfloc T · None · tub · 872 tablets").
    const parts = o.pack_name !== 'sack' ? [pickerNames.get(o.product_id), o.order_name, offerPackText(o, unit)] : [o.order_name, productName.get(o.product_id), `${Number(o.pack_size)} ${unit}`, o.form]
    return parts.filter(Boolean).join(' · ')
  }

  const read = lines.map((l) => {
    const offer = l.offerId === '' ? undefined : offerById.get(l.offerId)
    const price = parseDecimal(l.price, PRICE_DECIMALS)
    return {
      line: l,
      offer,
      packs: parsePacks(l.packs),
      price: price.ok && price.value != null ? Number(price.value) : null,
      // Sent as the typed decimal string, not a float.
      priceText: price.ok ? price.value : null,
      priceOk: price.ok && price.value != null,
    }
  })
  const total = runningTotal(
    read.map((r) => ({
      packs: r.packs,
      packSize: r.offer ? Number(r.offer.pack_size) : null,
      packName: r.offer?.pack_name,
      unit: r.offer ? productUnit.get(r.offer.product_id) : undefined,
      price: r.price,
    })),
  )
  // "36 of 40 sacks" on a grain-only order; "packs" when they differ (D62 A5).
  const linePacks = read.filter((r) => r.offer).map((r) => r.offer!.pack_name)
  const progress = targetProgress(total.packs, supplier?.order_target_packs, linePacks.length ? sharedPackName(linePacks) : 'sack')
  const valid = supplierId !== '' && !!orderedOn && lines.length > 0 && read.every((r) => r.offer && r.packs != null && r.priceOk)

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const pickOffer = (key: number, id: number | '') => {
    const o = id === '' ? undefined : offerById.get(id)
    setLine(key, { offerId: id, price: o?.current_price ? String(Number(o.current_price.price_per_pack)) : '' })
  }
  const pickSupplier = (id: number | '') => {
    setSupplierId(id)
    // Another supplier's offers don't carry over.
    setLines((ls) => ls.map((l) => ({ ...l, offerId: '', price: '' })))
  }

  const submit = async () => {
    if (!valid) return setError(`Each line needs an offer, whole ${packPlural(linePacks.length ? sharedPackName(linePacks) : 'sack')} and a price`)
    if (orderedOn > coloradoToday()) return setError(FUTURE_DATE)
    const body = {
      supplier_party_id: supplierId,
      ordered_on: orderedOn,
      expected_on: expectedOn || null,
      reference: reference.trim() || null,
      off_contract: offContract,
      notes: notes.trim() || null,
      lines: read.map((r) => ({ ...(r.line.id ? { id: r.line.id } : {}), offer_id: r.offer!.id, packs_ordered: r.packs, price_per_pack: r.priceText })),
      ...(order ? { lock_version: version } : {}),
    }
    try {
      const saved = order ? await update.mutateAsync({ id: order.id, ...body }) : await create.mutateAsync(body)
      onClose()
      onSaved?.(saved)
    } catch (err) {
      // The person's input stays; the page behind refetches, so reopening shows the change.
      setError(parseApiError(err))
      if (httpStatus(err) === 409) ORDER_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }))
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`${order ? 'Edit order' : 'New order'}${titleNote ? ` · ${titleNote}` : ''}`}
      onSubmit={submit}
      loading={create.isPending || update.isPending}
      error={error}
      submitDisabled={listsLoading || !valid}
      testId="order-dialog"
    >
      <FormControl fullWidth required>
        <InputLabel id="order-supplier-label">Supplier</InputLabel>
        <Select labelId="order-supplier-label" label="Supplier" value={suppliers.some((s) => s.id === supplierId) ? supplierId : ''} onChange={(e) => pickSupplier(e.target.value as number | '')} data-testid="order-supplier">
          {suppliers.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Order date"
          type="date"
          value={orderedOn}
          onChange={(e) => setOrderedOn(e.target.value)}
          required
          sx={{ flex: '1 1 150px' }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: coloradoToday(), 'data-testid': 'order-date' } }}
        />
        <TextField
          label="Expected"
          type="date"
          value={expectedOn}
          onChange={(e) => setExpectedOn(e.target.value)}
          sx={{ flex: '1 1 150px' }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: orderedOn || undefined, 'data-testid': 'order-expected' } }}
        />
      </Box>
      <TextField label="PO / reference" value={reference} onChange={(e) => setReference(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'order-reference' } }} />
      <FormControlLabel control={<Switch checked={offContract} onChange={(e) => setOffContract(e.target.checked)} data-testid="order-off-contract" />} label="Off-contract (doesn't count against a contract)" />

      <Typography variant="subtitle2">Lines</Typography>
      {read.map(({ line: l, offer, packs }, i) => (
        <Paper key={l.key} variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }} data-testid={`order-line-${i}`}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <FormControl fullWidth size="small" disabled={supplierId === ''}>
              <InputLabel id={`order-line-${i}-offer-label`}>Offer</InputLabel>
              <Select labelId={`order-line-${i}-offer-label`} label="Offer" value={choices.some((o) => o.id === l.offerId) ? l.offerId : ''} onChange={(e) => pickOffer(l.key, e.target.value as number | '')} data-testid={`order-line-${i}-offer`} sx={WRAP_SELECT}>
                {choices.map((o) => (
                  <MenuItem key={o.id} value={o.id} sx={WRAP_ITEM}>
                    {label(o)}
                    {!o.active && ' (inactive)'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Remove line">
              <span>
                <IconButton aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1} data-testid={`order-line-${i}-remove`}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label={packLabel(offer?.pack_name ?? 'sack')}
              size="small"
              value={l.packs}
              onChange={(e) => setLine(l.key, { packs: e.target.value })}
              error={l.packs.trim() !== '' && packs == null}
              helperText={
                l.packs.trim() !== '' && packs == null
                  ? wholePacks(offer?.pack_name ?? 'sack')
                  : offer
                    ? `${packSizeText(offer.pack_name, offer.pack_size, productUnit.get(offer.product_id))}${offer.pack_note ? ` (${offer.pack_note})` : ''}`
                    : undefined
              }
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': `order-line-${i}-packs` } }}
            />
            <DecimalInput
              decimals={PRICE_DECIMALS}
              label={`$ / ${offer?.pack_name ?? 'sack'}`}
              size="small"
              value={l.price}
              onChange={(t) => setLine(l.key, { price: t })}
              helperText={offer && !offer.current_price ? 'No current price' : undefined}
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { 'data-testid': `order-line-${i}-price` } }}
            />
          </Box>
        </Paper>
      ))}
      <Box>
        <Button startIcon={<AddIcon />} onClick={() => setLines((ls) => [...ls, newLine()])} disabled={supplierId === ''} data-testid="order-add-line">
          Add line
        </Button>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
        <Typography fontWeight={600} data-testid="order-running-total">
          {total.text}
        </Typography>
        {progress && (
          <Typography color="text.secondary" data-testid="order-target-progress">
            {progress}
          </Typography>
        )}
      </Box>
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
    </FormDialog>
  )
}
