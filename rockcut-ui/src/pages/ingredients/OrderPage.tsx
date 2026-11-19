import { useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import ItemNotFound from '../../components/ItemNotFound'
import StatusChip from '../../components/StatusChip'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useApiCreate } from '../../hooks/useApiMutation'
import { ORDER_KEYS } from '../../lib/inventory'
import { httpStatus, retryUnless404 } from '../../lib/notFound'
import parseApiError from '../../lib/parseApiError'
import { money, targetProgress } from '../../lib/purchasing'
import type { PurchaseOrder } from '../../lib/types'
import OrderDialog from './OrderDialog'
import ReceiveDialog from './ReceiveDialog'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '')

/**
 * D61 §4.1: an order: its header, lines and totals with the target
 * progress. While open: Edit, Cancel (asks first) and Receive; once received
 * or cancelled it's read-only and says who and when.
 */
export default function OrderPage() {
  const { id } = useParams()
  const orderId = Number(id)
  const [open, setOpen] = useState<'edit' | 'cancel' | 'receive' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { data: order, error } = useApiQuery<PurchaseOrder>(['purchase_order', orderId], `/api/purchase_orders/${orderId}`, undefined, { retry: retryUnless404 })
  const cancel = useApiCreate<PurchaseOrder>(`/api/purchase_orders/${orderId}/cancel`, { invalidateKeys: ORDER_KEYS })

  if (!order && httpStatus(error) === 404) {
    return <ItemNotFound what="Order" backTo="/ingredients/orders" backLabel="Back to Purchasing" testId="order-not-found" />
  }
  if (!order && error) return <Alert severity="error">{parseApiError(error)}</Alert>
  if (!order) return <CircularProgress />

  const isOpen = order.status === 'open'
  const received = order.status === 'received'
  const progress = order.target ? targetProgress(order.total_sacks, order.target.sacks) : null

  const doCancel = async () => {
    try {
      await cancel.mutateAsync({})
      setOpen(null)
    } catch (err) {
      setOpen(null)
      setActionError(parseApiError(err))
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Purchasing', to: '/ingredients/orders' },
          { label: `Order · ${order.supplier?.name ?? ''}` },
        ]}
        title={`Order · ${order.supplier?.name ?? ''} · ${order.ordered_on}`}
        toolbar={
          isOpen && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Button variant="contained" onClick={() => setOpen('receive')} data-testid="order-receive">
                Receive
              </Button>
              <Button variant="outlined" onClick={() => setOpen('edit')} data-testid="order-edit">
                Edit
              </Button>
              <Button variant="outlined" color="error" onClick={() => setOpen('cancel')} data-testid="order-cancel">
                Cancel order
              </Button>
            </Box>
          )
        }
      />

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Status
            </Typography>
            <Box data-testid="order-status">
              <StatusChip status={order.status} domain="order" />
              {order.off_contract && <Chip size="small" variant="outlined" label="Off-contract" sx={{ ml: 1 }} />}
            </Box>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Supplier
            </Typography>
            <Typography>{order.supplier?.name}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Ordered
            </Typography>
            <Typography>{order.ordered_on}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Expected
            </Typography>
            <Typography>{order.expected_on ?? '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="subtitle2" color="text.secondary">
              PO / reference
            </Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>{order.reference ?? '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 9 }}>
            <Typography variant="subtitle2" color="text.secondary">
              History
            </Typography>
            <Typography variant="body2" data-testid="order-history">
              Placed by {order.created_by?.name ?? '—'}
              {received && ` · received ${order.received_on} by ${order.received_by?.name ?? '—'} (${when(order.received_at)})`}
              {order.status === 'cancelled' && ` · cancelled by ${order.cancelled_by?.name ?? '—'} (${when(order.cancelled_at)})`}
            </Typography>
          </Grid>
          {order.notes && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" color="text.secondary">
                {order.notes}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Lines
      </Typography>
      <Paper variant="outlined" sx={{ overflowX: 'auto', mb: 2 }}>
        <Table size="small" data-testid="order-lines">
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell align="right">Sack</TableCell>
              <TableCell align="right">Ordered</TableCell>
              {received && <TableCell align="right">Received</TableCell>}
              <TableCell align="right">$ / sack</TableCell>
              <TableCell align="right">$</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {order.lines.map((l) => (
              <TableRow key={l.id} data-testid={`order-line-row-${l.id}`}>
                <TableCell>
                  <Link component={RouterLink} to={`/ingredients/products/${l.offer.product_id}`}>
                    {l.offer.product.display_name}
                  </Link>
                  {l.offer.order_name && (
                    <Typography variant="caption" color="text.secondary" component="div">
                      {l.offer.order_name}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {Number(l.offer.sack_size_lb)} lb
                </TableCell>
                <TableCell align="right">{l.sacks_ordered}</TableCell>
                {received && (
                  <TableCell align="right" data-testid={`order-line-received-${l.id}`}>
                    {l.sacks_received ?? 0}
                  </TableCell>
                )}
                <TableCell align="right">{money(l.price_per_sack)}</TableCell>
                <TableCell align="right">{money(l.line_dollars)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' }}>
        <Typography fontWeight={600} data-testid="order-totals">
          {order.total_sacks} {order.total_sacks === 1 ? 'sack' : 'sacks'} · {Number(order.total_lb).toLocaleString('en-US')} lb · {money(order.total_dollars)}
          {received && ' received'}
        </Typography>
        {progress && isOpen && (
          <Typography color="text.secondary" data-testid="order-page-target">
            {progress}
          </Typography>
        )}
      </Box>

      <OrderDialog open={open === 'edit'} onClose={() => setOpen(null)} order={order} />
      <ReceiveDialog open={open === 'receive'} onClose={() => setOpen(null)} order={order} />
      <ConfirmDialog
        open={open === 'cancel'}
        onClose={() => setOpen(null)}
        onConfirm={doCancel}
        title="Cancel order"
        message="Cancel this order? Nothing has been received."
        confirmLabel="Cancel order"
        cancelLabel="Keep it"
        loading={cancel.isPending}
        testId="order-cancel-confirm"
      />
    </>
  )
}
