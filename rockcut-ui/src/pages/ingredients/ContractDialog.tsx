import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Box, Button, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation'
import { httpStatus } from '../../lib/notFound'
import parseApiError from '../../lib/parseApiError'
import { PRICE_DECIMALS, parseDecimal } from '../../lib/brewingUnits'
import { GRAIN_KEYS } from '../../lib/inventory'
import { contractPriceChanges, contractYear, parseSacks } from '../../lib/purchasing'
import { coloradoToday } from '../../lib/tasks'
import type { Contract, IngredientProduct, Party, SupplierOffer } from '../../lib/types'

interface ContractDialogProps {
  open: boolean
  onClose: () => void
  contract?: Contract
  /** A new contract's year (the page's). */
  year: number
}

/**
 * D61 §3.1, §4.2: a malt contract with one supplier for a year: lines of
 * the products that supplier offers, in sacks at a price per sack; with
 * several offers of a product, the line names one. Before saving it lists
 * the offer prices the save writes ("BSG Rahr 2-Row price becomes $42.00
 * from 2027-01-01"). Owners and Brewery managers only (the page shows it to
 * them only; the API refuses others).
 */
export default function ContractDialog({ open, ...props }: ContractDialogProps) {
  return open ? <ContractForm {...props} /> : null
}

interface Line {
  key: number
  productId: number | ''
  offerId: number | ''
  sacks: string
  price: string
}

let lineKeys = 0
const newLine = (): Line => ({ key: lineKeys++, productId: '', offerId: '', sacks: '', price: '' })

function ContractForm({ onClose, contract, year: pageYear }: Omit<ContractDialogProps, 'open'>) {
  const [supplierId, setSupplierId] = useState<number | ''>(contract?.supplier_party_id ?? '')
  const [year, setYear] = useState(String(contract?.year ?? pageYear))
  const [notes, setNotes] = useState(contract?.notes ?? '')
  const [lines, setLines] = useState<Line[]>(() =>
    contract
      ? contract.lines.map((l) => ({ key: lineKeys++, productId: l.product_id, offerId: l.offer_id ?? '', sacks: String(l.sacks), price: String(Number(l.price_per_sack)) }))
      : [newLine()],
  )
  const [error, setError] = useState<string | null>(null)
  // Lead decisions 2 (gap 2): the version this dialog opened, kept if the page
  // refetches under it, so a save over someone else's change stays refused.
  const [version] = useState(contract?.lock_version)
  const qc = useQueryClient()

  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const { data: offers = [] } = useApiList<SupplierOffer>(['supplier_offers', { supplier_id: supplierId }], '/api/supplier_offers', supplierId === '' ? undefined : { supplier_id: supplierId }, {
    enabled: supplierId !== '',
  })
  const { data: products = [] } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products')
  const keys = [['contracts'], ['contract_shortfall'], ['supplier_offers'], ['offer_prices'], ...GRAIN_KEYS]
  const create = useApiCreate<Contract>('/api/contracts', { invalidateKeys: keys })
  const update = useApiUpdate<Contract>((id) => `/api/contracts/${id}`, { invalidateKeys: keys })

  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === contract?.supplier_party_id))
  const supplier = parties.find((p) => p.id === supplierId)
  const active = offers.filter((o) => o.supplier_party_id === supplierId && o.active)
  const productName = new Map(products.map((p) => [p.id, p.display_name]))
  const offered = [...new Set(active.map((o) => o.product_id))].map((id) => ({ id, name: productName.get(id) ?? `#${id}` })).sort((a, b) => a.name.localeCompare(b.name))
  const offersOf = (productId: number | '') => active.filter((o) => o.product_id === productId)

  const yearNumber = contractYear(year)
  const read = lines.map((l) => {
    const price = parseDecimal(l.price, PRICE_DECIMALS)
    const several = offersOf(l.productId).length > 1
    return { line: l, sacks: parseSacks(l.sacks), price: price.ok ? price.value : null, several }
  })
  const valid =
    supplierId !== '' &&
    yearNumber != null &&
    read.every((r) => r.line.productId !== '' && r.sacks != null && r.price != null && (!r.several || r.line.offerId !== ''))

  // The offer prices this save writes (decision 23, A2, decision 40).
  const before = new Map(contract?.lines.map((l) => [l.product_id, l]) ?? [])
  const changes =
    yearNumber == null || !supplier
      ? []
      : contractPriceChanges(
          read
            .filter((r) => r.line.productId !== '' && r.price != null)
            .map((r) => {
              const was = before.get(r.line.productId as number)
              const offerId = r.line.offerId !== '' ? r.line.offerId : (was?.offer_id ?? offersOf(r.line.productId)[0]?.id ?? null)
              return {
                product: productName.get(r.line.productId as number) ?? '',
                price: r.price!,
                changed: !was || Number(was.price_per_sack) !== Number(r.price) || (offerId != null && was.offer_id !== offerId),
              }
            }),
          supplier.name,
          yearNumber,
          coloradoToday(),
        )

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const pickProduct = (key: number, productId: number | '') => {
    const os = offersOf(productId)
    const only = os.length === 1 ? os[0] : null
    setLine(key, { productId, offerId: only?.id ?? '', price: only?.current_price ? String(Number(only.current_price.price_per_sack)) : '' })
  }

  const submit = async () => {
    if (!valid) return setError('Each line needs a product, whole sacks and a price')
    const body = {
      supplier_party_id: supplierId,
      year: yearNumber,
      notes: notes.trim() || null,
      lines: read.map((r) => ({ product_id: r.line.productId, sacks: r.sacks, price_per_sack: r.price, ...(r.line.offerId !== '' ? { offer_id: r.line.offerId } : {}) })),
      ...(contract ? { lock_version: version } : {}),
    }
    try {
      if (contract) await update.mutateAsync({ id: contract.id, ...body })
      else await create.mutateAsync(body)
      onClose()
    } catch (err) {
      // The person's input stays; the page behind refetches, so reopening shows the change.
      setError(parseApiError(err))
      if (httpStatus(err) === 409) keys.forEach((key) => qc.invalidateQueries({ queryKey: key }))
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={contract ? 'Edit contract' : 'New contract'}
      onSubmit={submit}
      loading={create.isPending || update.isPending}
      error={error}
      submitDisabled={!valid}
      testId="contract-dialog"
    >
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <FormControl required sx={{ flex: '2 1 200px' }}>
          <InputLabel id="contract-supplier-label">Supplier</InputLabel>
          <Select
            labelId="contract-supplier-label"
            label="Supplier"
            value={suppliers.some((s) => s.id === supplierId) ? supplierId : ''}
            onChange={(e) => {
              setSupplierId(e.target.value as number | '')
              setLines([newLine()])
            }}
            data-testid="contract-supplier"
          >
            {suppliers.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          required
          error={yearNumber == null}
          helperText={yearNumber == null ? 'A whole year, 2000–2100' : 'Runs Jan–Dec'}
          sx={{ flex: '1 1 100px' }}
          slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'contract-year' } }}
        />
      </Box>

      <Typography variant="subtitle2">Lines</Typography>
      {supplierId !== '' && offered.length === 0 && (
        <Alert severity="info">{supplier?.name} has no active offers yet: add one on a product page first.</Alert>
      )}
      {read.map(({ line: l, sacks, several }, i) => (
        <Paper key={l.key} variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }} data-testid={`contract-line-${i}`}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <FormControl fullWidth size="small" disabled={supplierId === ''}>
              <InputLabel id={`contract-line-${i}-product-label`}>Product</InputLabel>
              <Select
                labelId={`contract-line-${i}-product-label`}
                label="Product"
                value={offered.some((p) => p.id === l.productId) ? l.productId : ''}
                onChange={(e) => pickProduct(l.key, e.target.value as number | '')}
                data-testid={`contract-line-${i}-product`}
              >
                {offered.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Remove line">
              <span>
                <IconButton aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          {several && (
            <FormControl fullWidth size="small" required>
              <InputLabel id={`contract-line-${i}-offer-label`}>Offer</InputLabel>
              <Select
                labelId={`contract-line-${i}-offer-label`}
                label="Offer"
                value={offersOf(l.productId).some((o) => o.id === l.offerId) ? l.offerId : ''}
                onChange={(e) => setLine(l.key, { offerId: e.target.value as number | '' })}
                data-testid={`contract-line-${i}-offer`}
              >
                {offersOf(l.productId).map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {[o.order_name, `${Number(o.sack_size_lb)} lb`, o.form].filter(Boolean).join(' · ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="Sacks"
              size="small"
              value={l.sacks}
              onChange={(e) => setLine(l.key, { sacks: e.target.value })}
              error={l.sacks.trim() !== '' && sacks == null}
              helperText={l.sacks.trim() !== '' && sacks == null ? 'Whole sacks, 1 or more' : undefined}
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': `contract-line-${i}-sacks` } }}
            />
            <DecimalInput
              decimals={PRICE_DECIMALS}
              label="$ / sack"
              size="small"
              value={l.price}
              onChange={(t) => setLine(l.key, { price: t })}
              sx={{ flex: 1 }}
              slotProps={{ htmlInput: { 'data-testid': `contract-line-${i}-price` } }}
            />
          </Box>
        </Paper>
      ))}
      <Box>
        <Button startIcon={<AddIcon />} onClick={() => setLines((ls) => [...ls, newLine()])} disabled={supplierId === ''} data-testid="contract-add-line">
          Add line
        </Button>
      </Box>
      {changes.length > 0 && (
        <Alert severity="info" data-testid="contract-price-changes">
          Saving changes these offer prices:
          {changes.map((c) => (
            <Typography key={c} variant="body2" component="div">
              {c}
            </Typography>
          ))}
        </Alert>
      )}
      {yearNumber != null && yearNumber < Number(coloradoToday().slice(0, 4)) && (
        <Typography variant="body2" color="text.secondary" data-testid="contract-past-year">
          {yearNumber} is over: saving changes no offer prices.
        </Typography>
      )}
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
    </FormDialog>
  )
}
