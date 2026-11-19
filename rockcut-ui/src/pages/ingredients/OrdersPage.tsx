import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
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
import StatusChip from '../../components/StatusChip'
import { useApiList } from '../../hooks/useApiQuery'
import { money } from '../../lib/purchasing'
import type { OrderStatus, Party, PurchaseOrder } from '../../lib/types'
import OrderDialog from './OrderDialog'

/**
 * D61 §4.1: Ingredient Library → Purchasing: the orders, open first, then
 * received and cancelled, newest first (the API's order), filtered by
 * supplier and status. A row opens the order. At phone width, cards.
 */
export default function OrdersPage() {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const navigate = useNavigate()
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [adding, setAdding] = useState(false)
  const params: Record<string, string | number> = {}
  if (supplierId !== '') params.supplier_id = supplierId
  if (status !== '') params.status = status
  const { data: orders = [], isLoading } = useApiList<PurchaseOrder>(['purchase_orders', params], '/api/purchase_orders', params)
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')
  const suppliers = parties.filter((p) => p.roles?.includes('supplier'))
  const open = (o: PurchaseOrder) => navigate(`/ingredients/orders/${o.id}`)

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library', to: '/ingredients' }, { label: 'Purchasing' }]}
        title="Purchasing"
        action={{ label: 'New order', onClick: () => setAdding(true), testId: 'orders-new' }}
      />
      <PageToolbar>
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
          <InputLabel id="orders-supplier-label">Supplier</InputLabel>
          <Select labelId="orders-supplier-label" label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value as number | '')} data-testid="orders-supplier">
            <MenuItem value="">All suppliers</MenuItem>
            {suppliers.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 160 } }}>
          <InputLabel id="orders-status-label">Status</InputLabel>
          <Select labelId="orders-status-label" label="Status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')} data-testid="orders-status">
            <MenuItem value="">All</MenuItem>
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="received">Received</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>
      </PageToolbar>

      {phone ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="orders-cards">
          {orders.map((o) => (
            <Card key={o.id} variant="outlined">
              <CardActionArea onClick={() => open(o)} data-testid={`order-${o.id}`}>
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                    <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
                      {o.supplier?.name} · {o.ordered_on}
                    </Typography>
                    <StatusChip status={o.status} domain="order" />
                  </Box>
                  <Typography variant="body2">
                    {o.total_sacks} sacks · {money(o.total_dollars)}
                    {o.reference && ` · ${o.reference}`}
                  </Typography>
                  {o.expected_on && o.status === 'open' && (
                    <Typography variant="caption" color="text.secondary">
                      Expected {o.expected_on}
                    </Typography>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" data-testid="orders-table">
            <TableHead>
              <TableRow>
                <TableCell>Order date</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell align="right">Sacks</TableCell>
                <TableCell align="right">$</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Expected</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} hover sx={{ cursor: 'pointer' }} onClick={() => open(o)} data-testid={`order-${o.id}`}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{o.ordered_on}</TableCell>
                  <TableCell>
                    {o.supplier?.name}
                    {o.off_contract && <Chip size="small" variant="outlined" label="Off-contract" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{o.reference ?? ''}</TableCell>
                  <TableCell align="right">{o.total_sacks}</TableCell>
                  <TableCell align="right">{money(o.total_dollars)}</TableCell>
                  <TableCell>
                    <StatusChip status={o.status} domain="order" />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{o.expected_on ?? ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      {!isLoading && orders.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }} data-testid="orders-empty">
          No orders yet
        </Typography>
      )}

      <OrderDialog open={adding} onClose={() => setAdding(false)} onSaved={(o) => navigate(`/ingredients/orders/${o.id}`)} />
    </>
  )
}
