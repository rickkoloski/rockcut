import { useState } from 'react'
import { Box, Button, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Select, Switch, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { PRICE_DECIMALS, parseDecimal } from '../../lib/brewingUnits'
import { FUTURE_DATE, ORDER_KEYS } from '../../lib/inventory'
import { parseSacks, runningTotal, targetProgress } from '../../lib/purchasing'
import { coloradoToday } from '../../lib/tasks'
import type { IngredientProduct, Party, PurchaseOrder, SupplierOffer } from '../../lib/types'

interface OrderDialogProps {
  open: boolean
  onClose: () => void
  /** The open order to change; none for a new order. */
  order?: PurchaseOrder
  onSaved?: (order: PurchaseOrder) => void
}

/**
 * D61 §3.2, §4.1: a new order or a change to an open one. A supplier, the
 * order date (today by default, never after it), expected date, reference,
 * off-contract and notes; lines of that supplier's active offers in whole
 * sacks at a price per sack (the current price filled in), and a running
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
  sacks: string
  price: string
}

const WHOLE_SACKS = 'Whole sacks, 1 or more'

// React keys for lines: unique for the page's life.
let lineKeys = 0
const newLine = (): Line => ({ key: lineKeys++, offerId: '', sacks: '', price: '' })

function OrderForm({ onClose, order, onSaved }: Omit<OrderDialogProps, 'open'>) {
  const [supplierId, setSupplierId] = useState<number | ''>(order?.supplier_party_id ?? '')
  const [orderedOn, setOrderedOn] = useState(order?.ordered_on ?? coloradoToday())
  const [expectedOn, setExpectedOn] = useState(order?.expected_on ?? '')
  const [reference, setReference] = useState(order?.reference ?? '')
  const [offContract, setOffContract] = useState(order?.off_contract ?? false)
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [lines, setLines] = useState<Line[]>(() =>
    order
      ? order.lines.map((l) => ({ key: lineKeys++, id: l.id, offerId: l.offer_id, sacks: String(l.sacks_ordered), price: String(Number(l.price_per_sack)) }))
      : [newLine()],
  )
  const [error, setError] = useState<string | null>(null)

  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const { data: offers = [] } = useApiList<SupplierOffer>(['supplier_offers', { supplier_id: supplierId }], '/api/supplier_offers', supplierId === '' ? undefined : { supplier_id: supplierId }, {
    enabled: supplierId !== '',
  })
  const { data: products = [] } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products')
  const create = useApiCreate<PurchaseOrder>('/api/purchase_orders', { invalidateKeys: ORDER_KEYS })
  const update = useApiUpdate<PurchaseOrder>((id) => `/api/purchase_orders/${id}`, { invalidateKeys: ORDER_KEYS })

  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === order?.supplier_party_id))
  const supplier = parties.find((p) => p.id === supplierId)
  const productName = new Map(products.map((p) => [p.id, p.display_name]))
  // A line already on an inactive offer keeps it (lead, Stop 2 note 7); new picks are active offers only.
  const kept = new Set(order?.lines.map((l) => l.offer_id) ?? [])
  const choices = offers.filter((o) => o.supplier_party_id === supplierId && (o.active || kept.has(o.id)))
  const offerById = new Map(offers.map((o) => [o.id, o]))
  const label = (o: SupplierOffer) =>
    [o.order_name, productName.get(o.product_id), `${Number(o.sack_size_lb)} lb`, o.form === 'milled' ? 'milled' : 'whole'].filter(Boolean).join(' · ')

  const read = lines.map((l) => {
    const offer = l.offerId === '' ? undefined : offerById.get(l.offerId)
    const price = parseDecimal(l.price, PRICE_DECIMALS)
    return {
      line: l,
      offer,
      sacks: parseSacks(l.sacks),
      price: price.ok && price.value != null ? Number(price.value) : null,
      // Sent as the typed decimal string, not a float.
      priceText: price.ok ? price.value : null,
      priceOk: price.ok && price.value != null,
    }
  })
  const total = runningTotal(read.map((r) => ({ sacks: r.sacks, sackSize: r.offer ? Number(r.offer.sack_size_lb) : null, price: r.price })))
  const progress = targetProgress(total.sacks, supplier?.order_target_sacks)
  const valid = supplierId !== '' && !!orderedOn && lines.length > 0 && read.every((r) => r.offer && r.sacks != null && r.priceOk)

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const pickOffer = (key: number, id: number | '') => {
    const o = id === '' ? undefined : offerById.get(id)
    setLine(key, { offerId: id, price: o?.current_price ? String(Number(o.current_price.price_per_sack)) : '' })
  }
  const pickSupplier = (id: number | '') => {
    setSupplierId(id)
    // Another supplier's offers don't carry over.
    setLines((ls) => ls.map((l) => ({ ...l, offerId: '', price: '' })))
  }

  const submit = async () => {
    if (!valid) return setError('Each line needs an offer, whole sacks and a price')
    if (orderedOn > coloradoToday()) return setError(FUTURE_DATE)
    const body = {
      supplier_party_id: supplierId,
      ordered_on: orderedOn,
      expected_on: expectedOn || null,
      reference: reference.trim() || null,
      off_contract: offContract,
      notes: notes.trim() || null,
      lines: read.map((r) => ({ ...(r.line.id ? { id: r.line.id } : {}), offer_id: r.offer!.id, sacks_ordered: r.sacks, price_per_sack: r.priceText })),
    }
    try {
      const saved = order ? await update.mutateAsync({ id: order.id, ...body }) : await create.mutateAsync(body)
      onClose()
      onSaved?.(saved)
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={order ? 'Edit order' : 'New order'}
      onSubmit={submit}
      loading={create.isPending || update.isPending}
      error={error}
      submitDisabled={!valid}
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
      {read.map(({ line: l, offer, sacks }, i) => (
        <Paper key={l.key} variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }} data-testid={`order-line-${i}`}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <FormControl fullWidth size="small" disabled={supplierId === ''}>
              <InputLabel id={`order-line-${i}-offer-label`}>Offer</InputLabel>
              <Select labelId={`order-line-${i}-offer-label`} label="Offer" value={choices.some((o) => o.id === l.offerId) ? l.offerId : ''} onChange={(e) => pickOffer(l.key, e.target.value as number | '')} data-testid={`order-line-${i}-offer`}>
                {choices.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
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
              label="Sacks"
              size="small"
              value={l.sacks}
              onChange={(e) => setLine(l.key, { sacks: e.target.value })}
              error={l.sacks.trim() !== '' && sacks == null}
              helperText={l.sacks.trim() !== '' && sacks == null ? WHOLE_SACKS : offer ? `${Number(offer.sack_size_lb)} lb sacks` : undefined}
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': `order-line-${i}-sacks` } }}
            />
            <DecimalInput
              decimals={PRICE_DECIMALS}
              label="$ / sack"
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
