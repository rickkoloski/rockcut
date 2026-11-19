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
import { categoryOptions, grainCategories } from '../../lib/ingredientFeatures'
import { money } from '../../lib/purchasing'
import { coloradoToday } from '../../lib/tasks'
import { toTsv, type Cell } from '../../lib/tsv'
import type { IngredientCategory, InventoryTotals, OrderStatus, OrderTotals, Party } from '../../lib/types'
import PurchasingTabs from './PurchasingTabs'

const lb = (v: string | number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))

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
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library', to: '/ingredients' }, { label: 'Totals' }]} title="Purchasing" />
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
  const [maltsterId, setMaltsterId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const table = useRef<HTMLTableElement>(null)
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const params: Record<string, string> = { as_of: asOf && asOf <= today ? asOf : today }
  if (supplierId) params.supplier_id = supplierId
  if (maltsterId) params.maltster_id = maltsterId
  if (categoryId) params.category_id = categoryId
  const { data } = useApiQuery<InventoryTotals>(['ingredient_totals', 'inventory', params], '/api/ingredient_totals/inventory', params)
  const rows = data?.rows ?? []
  const unvalued = rows.reduce((n, r) => n + Number(r.unvalued_lb), 0)
  // Every row is a grain, so "All grains" is the parent: its sub-categories only (item 18).
  const { grains, children } = grainCategories(categories)
  const grainOptions = grains ? categoryOptions([grains, ...children]).filter((o) => o.depth > 0) : []

  const tsv = () =>
    toTsv(
      ['Grain', 'Maltster', 'Product', 'Category', 'lb', 'Expired lb', 'Sacks', '$/lb', 'Value', 'Estimated'],
      [
        ...rows.map((r): Cell[] => [r.grain, r.maltster, r.display_name, r.category, r.lb, r.expired_lb, r.sacks, r.per_lb, r.value, r.estimated]),
        ['Total', '', '', '', data?.total.lb, data?.total.expired_lb, '', '', data?.total.value, ''],
      ],
    )

  return (
    <>
      <PageToolbar end={<CopyTableButton text={tsv} table={table} testId="totals-inventory-copy" />}>
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
        <Filter label="Maltster" value={maltsterId} onChange={setMaltsterId} testId="totals-inventory-maltster">
          <MenuItem value="">All maltsters</MenuItem>
          {parties
            .filter((p) => p.roles?.includes('maltster'))
            .map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.name}
              </MenuItem>
            ))}
        </Filter>
        <Filter label="Category" value={categoryId} onChange={setCategoryId} testId="totals-inventory-category">
          <MenuItem value="">All grains</MenuItem>
          {grainOptions.map(({ category: c }) => (
            <MenuItem key={c.id} value={String(c.id)}>
              {c.name}
            </MenuItem>
          ))}
        </Filter>
      </PageToolbar>

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" ref={table} data-testid="totals-inventory-table">
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
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary">
                    No grain on hand {asOf === today ? 'today' : `on ${asOf}`}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.product_id} data-testid={`totals-inventory-${r.product_id}`}>
                <TableCell>{r.grain}</TableCell>
                <TableCell>
                  {r.maltster}
                  {r.display_name !== `${r.maltster} ${r.grain}` && (
                    <Typography variant="caption" color="text.secondary" component="div">
                      {r.display_name}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{r.category}</TableCell>
                <TableCell align="right" data-testid={`totals-inventory-${r.product_id}-lb`}>
                  {lb(r.lb)}
                </TableCell>
                <TableCell align="right">{Number(r.expired_lb) > 0 ? lb(r.expired_lb) : ''}</TableCell>
                <TableCell align="right">{r.sacks == null ? '—' : lb(r.sacks)}</TableCell>
                <TableCell align="right">{money(r.per_lb, 4)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`totals-inventory-${r.product_id}-value`}>
                  {r.value == null ? '—' : money(r.value)}
                  {r.value != null && r.estimated && ' est.'}
                </TableCell>
              </TableRow>
            ))}
            {data && rows.length > 0 && (
              <TableRow sx={{ '& td': { fontWeight: 600 } }} data-testid="totals-inventory-total">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell align="right">{lb(data.total.lb)}</TableCell>
                <TableCell align="right" data-testid="totals-inventory-total-expired">
                  {Number(data.total.expired_lb) > 0 ? lb(data.total.expired_lb) : ''}
                </TableCell>
                <TableCell colSpan={2} />
                <TableCell align="right">{money(data.total.value)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Value at the price paid; est. = valued at the supplier&apos;s offer price (no recorded cost).
        {unvalued > 0 && <span data-testid="totals-inventory-unvalued">{` ${lb(unvalued)} lb has no price and isn't valued.`}</span>}
      </Typography>
      {params.as_of !== today && (
        <Typography variant="body2" color="text.secondary" data-testid="totals-inventory-expired-note">
          Expired shows each lot&apos;s status today.
        </Typography>
      )}
    </>
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

  const tsv = () =>
    toTsv(
      ['Order date', 'Supplier', 'Reference', 'Product', 'Status', 'Sacks ordered', 'Sacks received', 'lb', '$'],
      [
        ...groups.flatMap((g): Cell[][] => [
          ...g.rows.map((r): Cell[] => [r.ordered_on, r.supplier, r.reference, r.product, r.status, r.sacks_ordered, r.sacks_received, r.lb, r.dollars]),
          [`Total ${g.sum.supplier}`, '', '', '', '', g.sum.sacks_ordered, g.sum.sacks_received, g.sum.lb, g.sum.dollars],
        ]),
        ['Total', '', '', '', '', data?.total.sacks_ordered, data?.total.sacks_received, data?.total.lb, data?.total.dollars],
      ],
    )

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
              <TableCell align="right">lb</TableCell>
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
                    <TableCell align="right">{r.sacks_ordered}</TableCell>
                    <TableCell align="right">{r.sacks_received ?? ''}</TableCell>
                    <TableCell align="right">{lb(r.lb)}</TableCell>
                    <TableCell align="right">{money(r.dollars)}</TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 600 }, backgroundColor: 'action.hover' }} data-testid={`totals-orders-supplier-${g.sum.supplier_id}`}>
                  <TableCell colSpan={5}>Total {g.sum.supplier}</TableCell>
                  <TableCell align="right">{g.sum.sacks_ordered}</TableCell>
                  <TableCell align="right">{g.sum.sacks_received}</TableCell>
                  <TableCell align="right">{lb(g.sum.lb)}</TableCell>
                  <TableCell align="right">{money(g.sum.dollars)}</TableCell>
                </TableRow>
              </Fragment>
            ))}
            {data && rows.length > 0 && (
              <TableRow sx={{ '& td': { fontWeight: 700 } }} data-testid="totals-orders-total">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell align="right">{data.total.sacks_ordered}</TableCell>
                <TableCell align="right">{data.total.sacks_received}</TableCell>
                <TableCell align="right">{lb(data.total.lb)}</TableCell>
                <TableCell align="right">{money(data.total.dollars)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
      <Box sx={{ mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Open orders count the sacks ordered; received ones the sacks received.
        </Typography>
      </Box>
    </>
  )
}
