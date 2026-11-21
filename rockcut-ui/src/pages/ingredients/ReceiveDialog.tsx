import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Alert, Box, Button, Collapse, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, TextField, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FormDialog from '../../components/FormDialog'
import FeatureFields from './FeatureFields'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate } from '../../hooks/useApiMutation'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { draftsFrom, draftsValid, featuresPayload, lotTypesFor, missingRequired, parseCropYear, requiredLotKeys, typesFor, type FeatureDrafts } from '../../lib/ingredientFeatures'
import { FUTURE_DATE, GRAIN_KEYS, ORDER_KEYS } from '../../lib/inventory'
import { emptySplitText, lineForError, lotChoiceLabel, parsePacks, previousLot, receivableLots, sharedPackName, splitSummary } from '../../lib/purchasing'
import { formatFeature, packLabel, packPlural } from '../../lib/brewingUnits'
import { coloradoToday } from '../../lib/tasks'
import type { ApiResponse, FeatureType, IngredientLot, IngredientProduct, PurchaseOrder, PurchaseOrderLine } from '../../lib/types'

const BEFORE_ORDER = "The received date can't be before the order date"

/**
 * D61 §3.3, §4.1: receive an open order, every line at once. The received
 * date (today by default, never after it); per line the packs received
 * (sacks for grain; as ordered unless changed; 0 = nothing came) and where
 * they go: the product's previous lot preselected (A3), another lot of the
 * same pack size, or a new lot number with the standard specs under "Specs";
 * **Add lot #** splits a line across lots, the rows adding up to the packs
 * received. Saving marks
 * the order received (decision 44: no back-order). D62 §4.4: a new hop lot
 * asks for its crop year (this year to start) and alpha acid right on the
 * line, beta and oil beside them, with the product's typical ranges.
 */
export default function ReceiveDialog({ open, ...props }: { open: boolean; onClose: () => void; order: PurchaseOrder }) {
  return open ? <ReceiveForm {...props} /> : null
}

const NEW = 'new' as const

interface Row {
  key: number
  /** A lot id, `new` for a new lot number, or null: the default (previous lot, else new). */
  target: number | typeof NEW | null
  number: string
  packs: string
  drafts: FeatureDrafts | null
  specsOpen: boolean
  /** D62: a new hop lot's crop year, as typed. */
  cropYear: string
}

// React keys for lot rows: unique for the page's life.
let rowKeys = 0
const row = (target: Row['target'] = null): Row => ({ key: rowKeys++, target, number: '', packs: '', drafts: null, specsOpen: false, cropYear: coloradoToday().slice(0, 4) })

interface LineState {
  received: string
  rows: Row[]
}

function ReceiveForm({ onClose, order }: { onClose: () => void; order: PurchaseOrder }) {
  const [receivedOn, setReceivedOn] = useState(coloradoToday())
  const [state, setState] = useState<Record<number, LineState>>(() =>
    Object.fromEntries(order.lines.map((l) => [l.id, { received: String(l.packs_ordered), rows: [row()] }])),
  )
  const [error, setError] = useState<string | null>(null)
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({})
  const receive = useApiCreate<PurchaseOrder>(`/api/purchase_orders/${order.id}/receive`, { invalidateKeys: [...ORDER_KEYS, ...GRAIN_KEYS] })

  // Each product's live lots and standard specs, on the keys the product page uses.
  const productIds = [...new Set(order.lines.map((l) => l.offer.product_id))]
  const lotQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ['ingredient_lots', { product_id: id }],
      queryFn: async () => (await api.get<ApiResponse<IngredientLot[]>>('/api/ingredient_lots', { params: { product_id: id } })).data.data,
    })),
  })
  const productQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ['ingredient_product', id],
      queryFn: async () => (await api.get<ApiResponse<IngredientProduct>>(`/api/ingredient_products/${id}`)).data.data,
    })),
  })
  const { data: types = [], isLoading: typesLoading } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  // Lead decisions 2 (item 7): Save waits for every line's lots and product and the feature types,
  // so a new lot never goes out without its standard features.
  const listsLoading = typesLoading || [...lotQueries, ...productQueries].some((q) => q.isLoading)

  const views = new Map(
    order.lines.map((l) => {
      const i = productIds.indexOf(l.offer.product_id)
      const lots = lotQueries[i]?.data
      return [l.id, lineView(l, state[l.id], Array.isArray(lots) ? lots : null, productQueries[i]?.data ?? null, types)]
    }),
  )
  // Not before the order date (lead decisions 1, gap 12).
  const beforeOrder = !!receivedOn && receivedOn < order.ordered_on
  const valid = !!receivedOn && !beforeOrder && order.lines.every((l) => views.get(l.id)!.body != null)

  const submit = async () => {
    if (receivedOn > coloradoToday()) return setError(FUTURE_DATE)
    if (receivedOn < order.ordered_on) return setError(BEFORE_ORDER)
    if (!valid) return setError(`Each line needs whole ${packPlural(sharedPackName(order.lines.map((l) => l.offer.pack_name)))} and a lot`)
    setLineErrors({})
    try {
      await receive.mutateAsync({ received_on: receivedOn, lines: order.lines.map((l) => views.get(l.id)!.body) })
      onClose()
    } catch (err) {
      const message = parseApiError(err)
      // The lots each line names: its new lot numbers and the lots it picked.
      const named = Object.fromEntries(
        order.lines.map((l) => [
          l.id,
          state[l.id].rows.flatMap((r) => {
            const t = views.get(l.id)!.targetOf(r)
            return t === NEW ? [r.number] : [views.get(l.id)!.choices.find((c) => c.id === t)?.lot_number ?? '']
          }),
        ]),
      )
      const lineId = lineForError(order.lines, message, named)
      if (lineId == null) setError(message)
      else {
        setError(null)
        setLineErrors({ [lineId]: message })
      }
    }
  }

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={`Receive · ${order.supplier?.name ?? 'order'}`}
      onSubmit={submit}
      loading={receive.isPending}
      error={error}
      submitDisabled={listsLoading || !valid}
      submitLabel="Receive"
      testId="receive-dialog"
    >
      <TextField
        label="Received"
        type="date"
        value={receivedOn}
        onChange={(e) => setReceivedOn(e.target.value)}
        required
        fullWidth
        error={beforeOrder}
        helperText={beforeOrder ? BEFORE_ORDER : undefined}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: order.ordered_on, max: coloradoToday(), 'data-testid': 'receive-date' } }}
      />
      {order.lines.map((l, i) => (
        <ReceiveLine
          key={l.id}
          index={i}
          line={l}
          state={state[l.id]}
          view={views.get(l.id)!}
          featureTypes={views.get(l.id)!.featureTypes}
          error={lineErrors[l.id]}
          onChange={(s) => setState((all) => ({ ...all, [l.id]: s }))}
          newRow={row}
        />
      ))}
    </FormDialog>
  )
}

interface LineView {
  /** Still loading the product's lots. */
  loading: boolean
  product: IngredientProduct | null
  /** D62: a hop line (new lots need a crop year and alpha). */
  hops: boolean
  /** The specs a new lot of this line takes, and the ones it must have. */
  featureTypes: FeatureType[]
  required: string[]
  /** Lots this line can go into (not expired, the offer's pack size), newest first. */
  choices: IngredientLot[]
  received: number | null
  split: boolean
  targetOf: (r: Row) => number | typeof NEW
  /** D62 lead decisions 1, gap 10: the product's lot a typed lot # already names (any case, trimmed). */
  existingOf: (r: Row) => IngredientLot | null
  draftsOf: (r: Row) => FeatureDrafts
  summary: { text: string; ok: boolean }
  /** What the line sends, or null while something is missing. */
  body: Record<string, unknown> | null
}

/**
 * A line's rows read against its product's lots: each row's lot (the
 * default is the previous lot, A3, else a new lot number), its packs (the
 * packs received when it's the only row), and the body Receive sends.
 */
function lineView(line: PurchaseOrderLine, state: LineState, lots: IngredientLot[] | null, product: IngredientProduct | null, types: FeatureType[]): LineView {
  const hops = product?.category_key === 'hops'
  const featureTypes = hops ? lotTypesFor(types, product?.category?.id, product?.category?.parent_id) : typesFor(types, product?.category?.id, product?.category?.parent_id)
  const required = requiredLotKeys(types, product?.category?.id, product?.category?.parent_id)
  const choices = receivableLots(lots ?? [], line.offer.pack_size)
  const previous = previousLot(lots ?? [], line.offer.pack_size)
  const received = parsePacks(state.received, 0)
  const split = state.rows.length > 1
  const targetOf = (r: Row) => r.target ?? previous?.id ?? NEW
  const existingOf = (r: Row) => {
    const typed = r.number.trim().toLowerCase()
    return (typed && (lots ?? []).find((l) => (l.lot_number ?? '').trim().toLowerCase() === typed)) || null
  }
  // A hop lot starts empty (the range stays on the product).
  const draftsOf = (r: Row) => r.drafts ?? draftsFrom(hops ? null : product?.features, featureTypes)
  const today = coloradoToday()
  // A number the product already has adds to that lot with its own values: nothing more to fill in.
  const newLotOk = (r: Row) =>
    !!existingOf(r) ||
    (r.number.trim() !== '' && draftsValid(draftsOf(r), featureTypes) && missingRequired(draftsOf(r), featureTypes, required).length === 0 && (!hops || !parseCropYear(r.cropYear, today).error))
  const rowPacks = state.rows.map((r) => (split ? parsePacks(r.packs) : received))
  const summary = splitSummary(rowPacks, received ?? 0)
  const rowsOk = state.rows.every((r, i) => {
    const t = targetOf(r)
    return (t !== NEW || newLotOk(r)) && rowPacks[i] != null
  })

  let body: Record<string, unknown> | null = null
  if (received === 0) body = { id: line.id, packs_received: 0, allocations: [] }
  else if (lots && received != null && rowsOk && (!split || summary.ok))
    body = {
      id: line.id,
      packs_received: received,
      allocations: state.rows.map((r, i) => {
        const t = targetOf(r)
        // An existing lot # sends no values: the API refuses ones that differ from the lot's.
        if (t === NEW && existingOf(r)) return { lot_number: r.number.trim(), packs: rowPacks[i] }
        return t === NEW
          ? {
              lot_number: r.number.trim(),
              packs: rowPacks[i],
              features: featuresPayload(draftsOf(r), hops ? null : product?.features),
              ...(hops ? { crop_year: parseCropYear(r.cropYear, today).year } : {}),
            }
          : { lot_id: t, packs: rowPacks[i] }
      }),
    }

  return { loading: !lots, product, hops, featureTypes, required, choices, received, split, targetOf, existingOf, draftsOf, summary, body }
}

/**
 * D62 lead decisions 1, gap 10: a typed lot # the product already has adds
 * to that lot, so its crop year and specs show read only, not as boxes whose
 * values would be dropped.
 */
function ExistingLotValues({ lot, types, hops, testId }: { lot: IngredientLot; types: FeatureType[]; hops: boolean; testId: string }) {
  const values = [
    ...(hops ? [`Crop year ${lot.crop_year ?? '—'}`] : []),
    ...types.flatMap((t) => {
      const v = lot.features?.[t.key]?.value
      return v == null || v === '' ? [] : [`${t.label} ${formatFeature(v, t.decimals)}${t.unit_label ? ` ${t.unit_label}` : ''}`]
    }),
  ]
  return (
    <Typography variant="body2" color="text.secondary" data-testid={testId}>
      {values.length ? values.join(' · ') : 'No specs recorded'}
    </Typography>
  )
}

interface ReceiveLineProps {
  index: number
  line: PurchaseOrderLine
  state: LineState
  view: LineView
  featureTypes: FeatureType[]
  error?: string
  onChange: (s: LineState) => void
  newRow: (target?: Row['target']) => Row
}

/** One line: packs received and the lot rows. */
function ReceiveLine({ index, line, state, view, featureTypes, error, onChange, newRow }: ReceiveLineProps) {
  const { mode } = useQuantityDisplay()
  const { choices, received, split, targetOf, existingOf, draftsOf, summary, product } = view
  // Decisions 5, gap 3: a split of 0 says why Receive waits.
  const emptySplit = split ? emptySplitText(state.rows.map((r) => r.packs), line.offer.pack_name) : null

  const setRow = (key: number, patch: Partial<Row>) => onChange({ ...state, rows: state.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) })

  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }} data-testid={`receive-line-${index}`}>
      <Box>
        <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
          {line.offer.product.display_name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {line.offer.label !== line.offer.product.display_name && `${line.offer.label} · `}
          ordered {line.packs_ordered} × {Number(line.offer.pack_size)} {line.offer.product.unit ?? 'lb'}
        </Typography>
      </Box>
      {error && <Alert severity="error" data-testid={`receive-line-${index}-error`}>{error}</Alert>}
      <TextField
        label={`${packLabel(line.offer.pack_name)} received`}
        size="small"
        value={state.received}
        onChange={(e) => onChange({ ...state, received: e.target.value })}
        error={received == null}
        helperText={received == null ? `Whole ${packPlural(line.offer.pack_name)}, 0 or more` : received === line.packs_ordered ? 'Received in full' : received === 0 ? 'Nothing came' : `Short or over: ordered ${line.packs_ordered}`}
        slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': `receive-line-${index}-packs` } }}
      />
      {received !== 0 &&
        state.rows.map((r, ri) => {
          const t = targetOf(r)
          const existing = t === NEW ? existingOf(r) : null
          return (
            <Box key={r.key} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} data-testid={`receive-line-${index}-row-${ri}`}>
              {/* At phone width the lot select keeps the whole row; the packs box and remove wrap under it. */}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ flex: '1 1 240px', minWidth: 0 }}>
                  <InputLabel id={`receive-${index}-${ri}-lot-label`}>Goes to</InputLabel>
                  <Select
                    labelId={`receive-${index}-${ri}-lot-label`}
                    label="Goes to"
                    value={view.loading ? '' : String(t)}
                    onChange={(e) => setRow(r.key, { target: e.target.value === NEW ? NEW : Number(e.target.value) })}
                    data-testid={`receive-line-${index}-row-${ri}-lot`}
                  >
                    {choices.map((lot) => (
                      <MenuItem key={lot.id} value={String(lot.id)} sx={{ whiteSpace: 'normal' }}>
                        {lotChoiceLabel(lot, mode)}
                      </MenuItem>
                    ))}
                    <MenuItem value={NEW}>New lot #</MenuItem>
                  </Select>
                </FormControl>
                {split && (
                  <TextField
                    label={packLabel(line.offer.pack_name)}
                    size="small"
                    value={r.packs}
                    onChange={(e) => setRow(r.key, { packs: e.target.value })}
                    error={parsePacks(r.packs, 0) === 0}
                    sx={{ width: 90, flexShrink: 0 }}
                    slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': `receive-line-${index}-row-${ri}-packs` } }}
                  />
                )}
                {split && (
                  <Tooltip title="Remove this lot">
                    <IconButton aria-label="Remove this lot" onClick={() => onChange({ ...state, rows: state.rows.filter((x) => x.key !== r.key) })} data-testid={`receive-line-${index}-row-${ri}-remove`}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              {t === NEW && (
                <>
                  <TextField
                    label="Lot #"
                    size="small"
                    value={r.number}
                    onChange={(e) => setRow(r.key, { number: e.target.value })}
                    required
                    helperText={existing ? `Adds to existing lot ${existing.lot_number}` : 'A number the product already has adds to that lot'}
                    slotProps={{ htmlInput: { 'data-testid': `receive-line-${index}-row-${ri}-number` } }}
                  />
                  {existing ? (
                    <ExistingLotValues lot={existing} types={featureTypes} hops={view.hops} testId={`receive-line-${index}-row-${ri}-existing`} />
                  ) : view.hops ? (
                    <>
                      <TextField
                        label="Crop year"
                        size="small"
                        value={r.cropYear}
                        onChange={(e) => setRow(r.key, { cropYear: e.target.value })}
                        required
                        error={!!parseCropYear(r.cropYear, coloradoToday()).error}
                        helperText={parseCropYear(r.cropYear, coloradoToday()).error ?? undefined}
                        slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': `receive-line-${index}-row-${ri}-crop-year` } }}
                      />
                      <FeatureFields types={featureTypes} drafts={draftsOf(r)} onChange={(d) => setRow(r.key, { drafts: d })} typical={product?.features ?? {}} required={view.required} />
                    </>
                  ) : (
                  <Box>
                    <Button
                      size="small"
                      onClick={() => setRow(r.key, { specsOpen: !r.specsOpen })}
                      endIcon={<ExpandMoreIcon sx={{ transform: r.specsOpen ? 'rotate(180deg)' : undefined }} />}
                      data-testid={`receive-line-${index}-row-${ri}-specs`}
                    >
                      Specs
                    </Button>
                    <Collapse in={r.specsOpen} unmountOnExit>
                      <Box sx={{ pt: 1 }}>
                        <FeatureFields types={featureTypes} drafts={draftsOf(r)} onChange={(d) => setRow(r.key, { drafts: d })} standard={product?.features ?? {}} />
                      </Box>
                    </Collapse>
                  </Box>
                  )}
                </>
              )}
            </Box>
          )
        })}
      {received !== 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() =>
              onChange({
                ...state,
                // Splitting: the first row keeps the packs received until changed.
                rows: [...state.rows.map((r, i) => (i === 0 && !split ? { ...r, packs: state.received } : r)), newRow(NEW)],
              })
            }
            data-testid={`receive-line-${index}-add-lot`}
          >
            Add lot #
          </Button>
          {split && (
            <Typography variant="body2" color={summary.ok ? 'text.secondary' : 'error'} data-testid={`receive-line-${index}-split`}>
              {summary.text}
            </Typography>
          )}
          {emptySplit && (
            <Typography variant="body2" color="error" sx={{ flexBasis: '100%' }} data-testid={`receive-line-${index}-split-empty`}>
              {emptySplit}
            </Typography>
          )}
        </Box>
      )}
    </Paper>
  )
}
