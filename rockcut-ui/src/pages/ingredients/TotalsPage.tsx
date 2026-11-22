import { Fragment, useRef, useState } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import PageHeader from '../../components/PageHeader'
import { PageToolbar } from '../../components/SettingsMenu'
import CopyTableButton from '../../components/CopyTableButton'
import StatusChip from '../../components/StatusChip'
import { useApiList, useApiQuery } from '../../hooks/useApiQuery'
import { packLabel, packPlural, packWord, perUnitLabel } from '../../lib/brewingUnits'
import { MANAGED_KEYS, categoryKey, categoryOptions, keyedCategories, manufacturerLabel, manufacturersFor } from '../../lib/ingredientFeatures'
import { amountText, byUnitText, copyQuantity, money, packsFigure, sharedPackName } from '../../lib/purchasing'
import { coloradoToday } from '../../lib/tasks'
import { toTsv, type Cell } from '../../lib/tsv'
import type { IngredientCategory, IngredientProduct, InventoryTotals, InventoryTotalsRow, OrderStatus, OrderTotals, OrderTotalsSum, Party, UnitQuantity } from '../../lib/types'
import PurchasingTabs from './PurchasingTabs'
import { libraryHref } from '../../lib/libraryView'

/** "30 sacks", "1 box". */
const packCount = (n: number, name: string | null | undefined) => `${n.toLocaleString('en-US')} ${packWord(name, n)}`

/** A sum's packs per pack name: "73 sacks · 47 boxes" (never one number across names). */
const byPackText = (s: OrderTotalsSum, field: 'packs_ordered' | 'packs_received') =>
  s.by_pack.map((p) => packCount(p[field], p.pack_name)).join(' · ') || '0'

const lb = (v: string | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))

/** D62 §3.8: the lb part of a quantity per unit (the grain-only view and the order totals' lb column). */
const inLb = <T extends UnitQuantity>(byUnit: T[] | undefined): T | undefined => byUnit?.find((u) => u.unit === 'lb')

/**
 * D61 §3.6, §4.4: the totals, each a plain table with a Copy button that
 * pastes into a spreadsheet as columns (decision 36). **Inventory**: grain on
 * hand and its value as of a date (decision 37), per product with a grand
 * total. **Orders**: one row per order line in a date range, a subtotal per
 * supplier and a grand total (decision 35). Tables scroll inside their box at
 * phone width. Lead decisions 1: a product with no value shows "—" (Copy
 * leaves it empty), the totals carry expired lb and sacks, and a past As of
 * says Expired is today's status (there's no status history).
 */
export default function TotalsPage() {
  const [tab, setTab] = useState<'inventory' | 'orders'>('inventory')
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library', to: libraryHref() }, { label: 'Totals' }]} title="Purchasing" />
      <PurchasingTabs />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="inventory" label="Inventory" data-testid="totals-tab-inventory" />
        <Tab value="orders" label="Orders" data-testid="totals-tab-orders" />
      </Tabs>
      {tab === 'inventory' ? <InventoryTotalsView /> : <OrderTotalsView />}
    </>
  )
}

function Filter({ label, value, onChange, children, testId }: { label: string; value: number | string; onChange: (v: string) => void; children: React.ReactNode; testId: string }) {
  const id = `${testId}-label`
  return (
    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 170 } }}>
      <InputLabel id={id}>{label}</InputLabel>
      <Select labelId={id} label={label} value={value} onChange={(e) => onChange(String(e.target.value))} data-testid={testId}>
        {children}
      </Select>
    </FormControl>
  )
}

function InventoryTotalsView() {
  const today = coloradoToday()
  const [asOf, setAsOf] = useState(today)
  const [supplierId, setSupplierId] = useState('')
  const [manufacturerId, setManufacturerId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const table = useRef<HTMLTableElement>(null)
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const { data: products = [] } = useApiList<IngredientProduct>(['ingredient_products'], '/api/ingredient_products')
  const params: Record<string, string> = { as_of: asOf && asOf <= today ? asOf : today }
  if (supplierId) params.supplier_id = supplierId
  // Gap 9: "None" is the products with no manufacturer (`manufacturer=none`).
  if (manufacturerId === NO_MAKER) params.manufacturer = NO_MAKER
  else if (manufacturerId) params.manufacturer_id = manufacturerId
  if (categoryId) params.category_id = categoryId
  const { data } = useApiQuery<InventoryTotals>(['ingredient_totals', 'inventory', params], '/api/ingredient_totals/inventory', params)
  const rows = data?.rows ?? []
  // D62 lead decisions 1, gap 4: every category with stock (Grains and its
  // children, Hops), All categories by default. Grains or one of its children
  // reads as D61 did (Grain, Maltster, Sacks).
  const options = MANAGED_KEYS.flatMap((key) => {
    const { category, children } = keyedCategories(categories, key)
    return category ? categoryOptions([category, ...children]) : []
  })
  const shownKey = categoryId ? categoryKey(categories, categories.find((c) => String(c.id) === categoryId)) : null
  const grain = shownKey === 'grains'
  // Gap 5: only the manufacturers with products in what's shown.
  const makersFor = (key: string | null) =>
    manufacturersFor(
      parties.filter((p) => p.roles?.includes('manufacturer')),
      products,
      key ? [key] : MANAGED_KEYS,
    )
  const makers = makersFor(shownKey)
  // Lead decisions 1 (gap 9): None when a product shown has no manufacturer (D65 decision 8).
  const noneFor = (key: string | null) =>
    products.some((p) => p.manufacturer_party_id == null && (key ? p.category_key === key : (MANAGED_KEYS as readonly string[]).includes(p.category_key ?? '')))
  const pickCategory = (v: string) => {
    setCategoryId(v)
    const key = v ? categoryKey(categories, categories.find((c) => String(c.id) === v)) : null
    if (manufacturerId && !(manufacturerId === NO_MAKER ? noneFor(key) : makersFor(key).some((p) => String(p.id) === manufacturerId))) setManufacturerId('')
  }

  return (
    <>
      <PageToolbar end={<CopyTableButton text={() => (grain ? grainTsv(data) : inventoryTsv(data))} table={table} testId="totals-inventory-copy" />}>
        <TextField
          label="As of"
          type="date"
          size="small"
          value={asOf}
          onChange={(e) => setAsOf(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today, 'data-testid': 'totals-as-of' } }}
          sx={{ minWidth: { xs: '100%', sm: 170 } }}
        />
        <Filter label="Supplier" value={supplierId} onChange={setSupplierId} testId="totals-inventory-supplier">
          <MenuItem value="">All suppliers</MenuItem>
          {parties
            .filter((p) => p.roles?.includes('supplier'))
            .map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.name}
              </MenuItem>
            ))}
        </Filter>
        <Filter label={manufacturerLabel(shownKey)} value={manufacturerId} onChange={setManufacturerId} testId="totals-inventory-maltster">
          <MenuItem value="">{grain ? 'All maltsters' : 'All manufacturers'}</MenuItem>
          {makers.map((p) => (
            <MenuItem key={p.id} value={String(p.id)}>
              {p.name}
            </MenuItem>
          ))}
          {noneFor(shownKey) && <MenuItem value={NO_MAKER}>None</MenuItem>}
        </Filter>
        <Filter label="Category" value={categoryId} onChange={pickCategory} testId="totals-inventory-category">
          <MenuItem value="">All categories</MenuItem>
          {options.map(({ category: c, depth }) => (
            <MenuItem key={c.id} value={String(c.id)} sx={{ pl: depth ? 4 : 2 }}>
              {c.name}
            </MenuItem>
          ))}
        </Filter>
      </PageToolbar>

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" ref={table} data-testid="totals-inventory-table">
          {grain ? <GrainTotals data={data} asOf={asOf} today={today} /> : <InventoryTotalsRows data={data} asOf={asOf} today={today} />}
        </Table>
      </Paper>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Value at the price paid; est. = valued at the supplier&apos;s offer price (no recorded cost).
        {rows.some((r) => Number(r.unvalued_quantity) > 0) && (
          <span data-testid="totals-inventory-unvalued">{` ${byUnitText(unvaluedByUnit(rows))} has no price and isn't valued.`}</span>
        )}
      </Typography>
      {params.as_of !== today && (
        <Typography variant="body2" color="text.secondary" data-testid="totals-inventory-expired-note">
          Expired shows each lot&apos;s status today.
        </Typography>
      )}
    </>
  )
}

/** The Manufacturer filter's "None" (gap 9). */
const NO_MAKER = 'none'

/** The quantity with no value, per unit. */
function unvaluedByUnit(rows: InventoryTotalsRow[]): UnitQuantity[] {
  // Per unit and label, as the API's subtotals (D64 §13: bricks and pitchables apart, like tablets).
  const sums = new Map<string, { unit: string; unit_label: string; q: number }>()
  for (const r of rows)
    if (Number(r.unvalued_quantity) > 0) {
      const label = r.unit_label ?? r.unit
      const key = `${r.unit}:${label}`
      const s = sums.get(key) ?? { unit: r.unit, unit_label: label, q: 0 }
      sums.set(key, { ...s, q: s.q + Number(r.unvalued_quantity) })
    }
  return [...sums]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, s]) => ({ unit: s.unit, unit_label: s.unit_label, quantity: String(Math.round(s.q * 100) / 100) }))
}

/** "0.32 boxes", "12 sacks"; "—" when the product's lots differ in pack. */
const packsText = (r: Pick<InventoryTotalsRow, 'packs' | 'pack_name'>) =>
  r.packs == null ? '—' : `${packsFigure(Number(r.packs))} ${packWord(r.pack_name, Number(r.packs))}`

/** The product's name beside its manufacturer when it says more than maker, ingredient and form. */
const productCaption = (r: InventoryTotalsRow) =>
  r.display_name !== [r.manufacturer, r.ingredient, r.form].filter(Boolean).join(' ') ? r.display_name : null

function NothingOnHand({ what, asOf, today, cols }: { what: string; asOf: string; today: string; cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols}>
        <Typography variant="body2" color="text.secondary">
          No {what} on hand {asOf === today ? 'today' : `on ${asOf}`}
        </Typography>
      </TableCell>
    </TableRow>
  )
}

/** D62 lead decisions 1, gap 4: every category, general headings, each product's own unit and pack. */
function InventoryTotalsRows({ data, asOf, today }: { data: InventoryTotals | undefined; asOf: string; today: string }) {
  const rows = data?.rows ?? []
  return (
    <>
      <TableHead>
        <TableRow>
          <TableCell>Ingredient</TableCell>
          <TableCell>Manufacturer</TableCell>
          <TableCell>Form</TableCell>
          <TableCell align="right">On hand</TableCell>
          <TableCell align="right">Packs</TableCell>
          <TableCell align="right">Value</TableCell>
          <TableCell align="right">$/unit</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.length === 0 && <NothingOnHand what="stock" asOf={asOf} today={today} cols={7} />}
        {rows.map((r) => (
          <TableRow key={r.product_id} data-testid={`totals-inventory-${r.product_id}`}>
            <TableCell>{r.ingredient}</TableCell>
            <TableCell>
              {r.manufacturer}
              {productCaption(r) && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {productCaption(r)}
                </Typography>
              )}
            </TableCell>
            <TableCell>{r.form ?? ''}</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`totals-inventory-${r.product_id}-lb`}>
              {amountText(r.quantity, r.unit_label ?? r.unit)}
              {Number(r.expired) > 0 && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {amountText(r.expired, r.unit_label ?? r.unit)} expired
                </Typography>
              )}
            </TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`totals-inventory-${r.product_id}-packs`}>
              {packsText(r)}
            </TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`totals-inventory-${r.product_id}-value`}>
              {r.value == null ? '—' : money(r.value)}
              {r.value != null && r.estimated && ' est.'}
            </TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
              {r.per_unit == null ? '—' : `${money(r.per_unit, 4)}/${perUnitLabel(r.unit_label ?? r.unit)}`}
            </TableCell>
          </TableRow>
        ))}
        {data && rows.length > 0 && (
          <TableRow sx={{ '& td': { fontWeight: 600 } }} data-testid="totals-inventory-total">
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
              {/* D65 §4.5: a subtotal per unit, one line each, never added together; one $ total. */}
              {data.total.by_unit.map((u) => (
                // D64 §13: one line per unit and label (bricks, pitchables, tablets are `each`).
                <div key={`${u.unit}:${u.unit_label ?? u.unit}`} data-testid={`totals-inventory-total-${(u.unit_label ?? u.unit).replace(' ', '-')}`}>
                  {amountText(u.quantity, u.unit_label ?? u.unit)}
                </div>
              ))}
              {data.total.by_unit.some((u) => Number(u.expired) > 0) && (
                <Typography variant="caption" component="div" data-testid="totals-inventory-total-expired">
                  {byUnitText(data.total.by_unit.filter((u) => Number(u.expired) > 0).map((u) => ({ unit: u.unit, unit_label: u.unit_label, quantity: u.expired })))} expired
                </Typography>
              )}
            </TableCell>
            <TableCell />
            <TableCell align="right">{money(data.total.value)}</TableCell>
            <TableCell />
          </TableRow>
        )}
      </TableBody>
    </>
  )
}

/**
 * Copy for the general view: its headings, plus Unit and Pack so the numbers
 * paste as numbers. D65 lead decisions 3: the Unit is the label ("tablets",
 * gap 4); the per-unit Total rows have no $, and the $ total has its own
 * "Total value" row (gap 3).
 */
function inventoryTsv(data: InventoryTotals | undefined): string {
  const rows = data?.rows ?? []
  return toTsv(
    ['Ingredient', 'Manufacturer', 'Product', 'Form', 'On hand', 'Unit', 'Expired', 'Packs', 'Pack', 'Value', '$/unit', 'Estimated'],
    [
      ...rows.map((r): Cell[] => {
        const unit = r.unit_label ?? r.unit
        return [r.ingredient, r.manufacturer, r.display_name, r.form, copyQuantity(r.quantity, unit), unit, copyQuantity(r.expired, unit), r.packs, r.packs == null ? null : r.pack_name, r.value, r.per_unit, r.estimated]
      }),
      ...(data?.total.by_unit ?? []).map((u): Cell[] => {
        const unit = u.unit_label ?? u.unit
        return ['Total', '', '', '', copyQuantity(u.quantity, unit), unit, copyQuantity(u.expired, unit), '', '', '', '', '']
      }),
      ...(data ? [['Total value', '', '', '', '', '', '', '', '', data.total.value, '', ''] as Cell[]] : []),
    ],
  )
}

/** The grain-only view, as D61 had it (Grains or one of its children picked). */
function GrainTotals({ data, asOf, today }: { data: InventoryTotals | undefined; asOf: string; today: string }) {
  const rows = data?.rows ?? []
  const totalLb = inLb(data?.total.by_unit)
  return (
    <>
      <TableHead>
        <TableRow>
          <TableCell>Grain</TableCell>
          <TableCell>Maltster</TableCell>
          <TableCell>Category</TableCell>
          <TableCell align="right">lb</TableCell>
          <TableCell align="right">Expired lb</TableCell>
          <TableCell align="right">Sacks</TableCell>
          <TableCell align="right">$/lb</TableCell>
          <TableCell align="right">Value</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.length === 0 && <NothingOnHand what="grain" asOf={asOf} today={today} cols={8} />}
        {rows.map((r) => (
          <TableRow key={r.product_id} data-testid={`totals-inventory-${r.product_id}`}>
            <TableCell>{r.ingredient}</TableCell>
            <TableCell>
              {r.manufacturer}
              {r.display_name !== `${r.manufacturer} ${r.ingredient}` && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {r.display_name}
                </Typography>
              )}
            </TableCell>
            <TableCell>{r.category}</TableCell>
            <TableCell align="right" data-testid={`totals-inventory-${r.product_id}-lb`}>
              {lb(r.quantity)}
            </TableCell>
            <TableCell align="right">{Number(r.expired) > 0 ? lb(r.expired) : ''}</TableCell>
            <TableCell align="right">{r.packs == null ? '—' : lb(r.packs)}</TableCell>
            <TableCell align="right">{money(r.per_unit, 4)}</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`totals-inventory-${r.product_id}-value`}>
              {r.value == null ? '—' : money(r.value)}
              {r.value != null && r.estimated && ' est.'}
            </TableCell>
          </TableRow>
        ))}
        {data && rows.length > 0 && (
          <TableRow sx={{ '& td': { fontWeight: 600 } }} data-testid="totals-inventory-total">
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell align="right">{lb(totalLb?.quantity ?? 0)}</TableCell>
            <TableCell align="right" data-testid="totals-inventory-total-expired">
              {Number(totalLb?.expired ?? 0) > 0 ? lb(totalLb?.expired) : ''}
            </TableCell>
            <TableCell colSpan={2} />
            <TableCell align="right">{money(data.total.value)}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </>
  )
}

function grainTsv(data: InventoryTotals | undefined): string {
  const rows = data?.rows ?? []
  const totalLb = inLb(data?.total.by_unit)
  return toTsv(
    ['Grain', 'Maltster', 'Product', 'Category', 'lb', 'Expired lb', 'Sacks', '$/lb', 'Value', 'Estimated'],
    [
      ...rows.map((r): Cell[] => [r.ingredient, r.manufacturer, r.display_name, r.category, r.quantity, r.expired, r.packs, r.per_unit, r.value, r.estimated]),
      ['Total', '', '', '', totalLb?.quantity ?? '0', totalLb?.expired ?? '0', '', '', data?.total.value, ''],
    ],
  )
}

function OrderTotalsView() {
  const year = coloradoToday().slice(0, 4)
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(`${year}-12-31`)
  const [supplierId, setSupplierId] = useState('')
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const table = useRef<HTMLTableElement>(null)
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const params: Record<string, string> = {}
  if (from) params.from = from
  if (to) params.to = to
  if (supplierId) params.supplier_id = supplierId
  if (status) params.status = status
  const { data } = useApiQuery<OrderTotals>(['ingredient_totals', 'orders', params], '/api/ingredient_totals/orders', params)
  const rows = data?.rows ?? []
  const groups = (data?.by_supplier ?? []).map((s) => ({ sum: s, rows: rows.filter((r) => r.supplier_id === s.supplier_id) }))

  // D62 lead decisions 1, gap 11: sacks and boxes are never added. Copy has
  // an ordered and a received column per pack name ("Sacks ordered", "Boxes
  // ordered", …), so an all-grain range copies as D61 did.
  const packNames = [...new Set(rows.map((r) => r.pack_name))].sort()
  const packCells = (s: OrderTotalsSum): Cell[] =>
    packNames.flatMap((name) => {
      const p = s.by_pack.find((b) => b.pack_name === name)
      return [p?.packs_ordered ?? 0, p?.packs_received ?? 0]
    })
  // D65 lead decisions 3: per-unit Total rows have no $; the $ has its own
  // "Total … value" row (gap 3). The Unit is the label, a count whole (gap 4).
  const blankPacks = () => packNames.flatMap((): Cell[] => ['', ''])
  const sumRows = (label: string, s: OrderTotalsSum): Cell[][] => [
    ...s.by_unit.map((u, i): Cell[] => {
      const unit = u.unit_label ?? u.unit
      return [label, '', '', '', '', ...(i === 0 ? packCells(s) : blankPacks()), copyQuantity(u.quantity, unit), unit, '']
    }),
    [`${label} value`, '', '', '', '', ...blankPacks(), '', '', s.dollars],
  ]
  const mixedTsv = () =>
    toTsv(
      ['Order date', 'Supplier', 'Reference', 'Product', 'Status', ...packNames.flatMap((n) => [`${packLabel(n)} ordered`, `${packLabel(n)} received`]), 'Quantity', 'Unit', '$'],
      [
        ...groups.flatMap((g): Cell[][] => [
          ...g.rows.map((r): Cell[] => [
            r.ordered_on,
            r.supplier,
            r.reference,
            r.product,
            r.status,
            ...packNames.flatMap((n): Cell[] => (n === r.pack_name ? [r.packs_ordered, r.packs_received] : ['', ''])),
            copyQuantity(r.quantity, r.unit_label ?? r.unit),
            r.unit_label ?? r.unit,
            r.dollars,
          ]),
          ...sumRows(`Total ${g.sum.supplier}`, g.sum),
        ]),
        ...(data ? sumRows('Total', data.total) : []),
      ],
    )
  const lbTsv = () =>
    toTsv(
      ['Order date', 'Supplier', 'Reference', 'Product', 'Status', ...packNames.flatMap((n) => [`${packLabel(n)} ordered`, `${packLabel(n)} received`]), 'lb', '$'],
      [
        ...groups.flatMap((g): Cell[][] => [
          ...g.rows.map((r): Cell[] => [
            r.ordered_on,
            r.supplier,
            r.reference,
            r.product,
            r.status,
            ...packNames.flatMap((n): Cell[] => (n === r.pack_name ? [r.packs_ordered, r.packs_received] : ['', ''])),
            r.quantity,
            r.dollars,
          ]),
          [`Total ${g.sum.supplier}`, '', '', '', '', ...packCells(g.sum), inLb(g.sum.by_unit)?.quantity ?? '0', g.sum.dollars],
        ]),
        ...(data ? [['Total', '', '', '', '', ...packCells(data.total), inLb(data.total.by_unit)?.quantity ?? '0', data.total.dollars] as Cell[]] : []),
      ],
    )
  const shared = sharedPackName(packNames)
  // D65 §4.5: lines in other units (gal, oz, fl oz, each) show their unit; an all-lb range reads as D61.
  const allLb = rows.every((r) => r.unit === 'lb')
  const qty = (r: { quantity: string; unit: string; unit_label?: string }) => (allLb ? lb(r.quantity) : amountText(r.quantity, r.unit_label ?? r.unit))
  const sumQty = (byUnit: UnitQuantity[]) =>
    allLb ? lb(inLb(byUnit)?.quantity ?? 0) : byUnit.map((u) => <div key={u.unit}>{amountText(u.quantity, u.unit_label ?? u.unit)}</div>)
  const tsv = () => (allLb ? lbTsv() : mixedTsv())

  return (
    <>
      <PageToolbar end={<CopyTableButton text={tsv} table={table} testId="totals-orders-copy" />}>
        <TextField label="From" type="date" size="small" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'totals-from' } }} sx={{ minWidth: { xs: '100%', sm: 160 } }} />
        <TextField label="To" type="date" size="small" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'totals-to' } }} sx={{ minWidth: { xs: '100%', sm: 160 } }} />
        <Filter label="Supplier" value={supplierId} onChange={setSupplierId} testId="totals-orders-supplier">
          <MenuItem value="">All suppliers</MenuItem>
          {parties
            .filter((p) => p.roles?.includes('supplier'))
            .map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.name}
              </MenuItem>
            ))}
        </Filter>
        <Filter label="Status" value={status} onChange={(v) => setStatus(v as OrderStatus | '')} testId="totals-orders-status">
          <MenuItem value="">Open and received</MenuItem>
          <MenuItem value="open">Open</MenuItem>
          <MenuItem value="received">Received</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </Filter>
      </PageToolbar>

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" ref={table} data-testid="totals-orders-table">
          <TableHead>
            <TableRow>
              <TableCell>Order date</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell>Reference</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Ordered</TableCell>
              <TableCell align="right">Received</TableCell>
              <TableCell align="right">{allLb ? 'lb' : 'Quantity'}</TableCell>
              <TableCell align="right">$</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography variant="body2" color="text.secondary">
                    No orders in this range
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <Fragment key={g.sum.supplier_id}>
                {g.rows.map((r) => (
                  <TableRow key={r.line_id} data-testid={`totals-orders-line-${r.line_id}`}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.ordered_on}</TableCell>
                    <TableCell>{r.supplier}</TableCell>
                    <TableCell>{r.reference ?? ''}</TableCell>
                    <TableCell>{r.product}</TableCell>
                    <TableCell>
                      <StatusChip status={r.status} domain="order" />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {packCount(r.packs_ordered, r.pack_name)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {r.packs_received == null ? '' : packCount(r.packs_received, r.pack_name)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{qty(r)}</TableCell>
                    <TableCell align="right">{money(r.dollars)}</TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 600 }, backgroundColor: 'action.hover' }} data-testid={`totals-orders-supplier-${g.sum.supplier_id}`}>
                  <TableCell colSpan={5}>Total {g.sum.supplier}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {byPackText(g.sum, 'packs_ordered')}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {byPackText(g.sum, 'packs_received')}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{sumQty(g.sum.by_unit)}</TableCell>
                  <TableCell align="right">{money(g.sum.dollars)}</TableCell>
                </TableRow>
              </Fragment>
            ))}
            {data && rows.length > 0 && (
              <TableRow sx={{ '& td': { fontWeight: 700 } }} data-testid="totals-orders-total">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid="totals-orders-total-ordered">
                  {byPackText(data.total, 'packs_ordered')}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid="totals-orders-total-received">
                  {byPackText(data.total, 'packs_received')}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid="totals-orders-total-quantity">
                  {sumQty(data.total.by_unit)}
                </TableCell>
                <TableCell align="right">{money(data.total.dollars)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary" data-testid="totals-orders-note">
          {`Open orders count the ${packPlural(shared)} ordered; received ones the ${packPlural(shared)} received.`}
        </Typography>
      </Box>
    </>
  )
}
