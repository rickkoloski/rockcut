import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Chip, CircularProgress, Link, Paper, Typography } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import HideUsedUpSwitch from '../../components/HideUsedUpSwitch'
import QuantityToggle from '../../components/QuantityToggle'
import StatusChip from '../../components/StatusChip'
import { useApiList } from '../../hooks/useApiQuery'
import { useHideUsedUpLots } from '../../hooks/useHideUsedUpLots'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import { formatFeature, formatQuantity, type QuantityDisplay } from '../../lib/brewingUnits'
import { toggleLabels } from '../../lib/ingredientFeatures'
import { inUseId, reorderError, splitUsedUp } from '../../lib/inventory'
import parseApiError from '../../lib/parseApiError'
import { saveQueue } from '../../lib/saveQueue'
import type { ApiResponse, HopUseList, HopUseLot } from '../../lib/types'
import OrderedList from '../production/OrderedList'

const lotName = (l: HopUseLot) => `Lot ${l.lot_number ?? `#${l.id}`}`

/**
 * D63 §4.4: a hop's use order, one list per form that has lots, across
 * makers. Brewing takes the first lot with stock that isn't expired ("In
 * use"). Drag by the handle, or the arrows; saved at once.
 */
export default function UseOrderSection({ ingredientId }: { ingredientId: number }) {
  const key = ['hop_use_lists', ingredientId]
  // Read again each time the page opens: an order someone changed is a 409 to move.
  const { data: lists = [], isLoading, error, refetch } = useApiList<HopUseList>(key, '/api/hop_use_lists', { ingredient_id: ingredientId }, { staleTime: 0 })
  return (
    <Box sx={{ mb: 3 }} data-testid="use-order">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6">Use order</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1 }}>
          <QuantityToggle {...toggleLabels('box', 'lb')} />
          <HideUsedUpSwitch />
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Brewing takes the first lot with stock. New lots go to the end.
      </Typography>
      {error ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => refetch()}>Retry</Button>} data-testid="use-order-failed">
          {parseApiError(error)}
        </Alert>
      ) : isLoading ? (
        <CircularProgress size={24} />
      ) : lists.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="use-order-empty">
          No lots yet.
        </Typography>
      ) : (
        lists.map((list) => <UseList key={list.form ?? ''} ingredientId={ingredientId} list={list} />)
      )}
    </Box>
  )
}

function UseList({ ingredientId, list }: { ingredientId: number; list: HopUseList }) {
  const qc = useQueryClient()
  const { mode } = useQuantityDisplay()
  const { hide } = useHideUsedUpLots()
  // While saves are out, the list stays as it was when the first began (the
  // moves are shown on top of it), so one answer can't undo the next move.
  const [held, setHeld] = useState<HopUseList | null>(null)
  const [settled, setSettled] = useState(0)
  const shown = held ?? list
  const { stocked, usedUp } = useMemo(() => splitUsedUp(shown.lots), [shown])
  // A settled save (or failure) starts again from the list, even one that reads the same.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => [...stocked], [stocked, settled])

  const form = list.form
  const [queue] = useState(() =>
    saveQueue<HopUseList>(
      async (lotIds, version) => {
        const { data } = await api.put<ApiResponse<HopUseList>>('/api/hop_use_lists/order', { ingredient_id: ingredientId, form, lot_ids: lotIds, version })
        // Only this form's list: the other's may be saving.
        qc.setQueryData<HopUseList[]>(['hop_use_lists', ingredientId], (lists) => lists?.map((l) => (l.form === form ? data.data : l)))
        return data.data
      },
      () => {
        setHeld(null)
        setSettled((n) => n + 1)
        qc.invalidateQueries({ queryKey: ['hop_use_lists'] })
        qc.invalidateQueries({ queryKey: ['ingredient_lots'] })
      },
    ),
  )

  const reorder = (ids: number[]) => {
    setHeld((h) => h ?? list)
    return queue.push(ids, shown.version)
  }

  const testId = `use-order-${(form ?? 'none').replace(/\W+/g, '-').toLowerCase()}`
  return (
    <Box sx={{ mb: 2 }} data-testid={`${testId}-section`}>
      <Typography variant="subtitle1" sx={{ mb: 0.75 }}>
        {form ?? 'No form'}
      </Typography>
      <OrderedList
        items={items}
        onReorder={reorder}
        label={lotName}
        render={(lot, ids) => <LotRow lot={lot} place={ids.indexOf(lot.id) + 1} inUse={inUseId(ids, items) === lot.id} mode={mode} />}
        errorText={reorderError}
        testId={testId}
      />
      {items.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No lots with stock.
        </Typography>
      )}
      {!hide && usedUp.length > 0 && (
        <Box data-testid={`${testId}-used-up`}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 0.75 }}>
            Used up
          </Typography>
          {usedUp.map((lot) => (
            <Paper key={lot.id} variant="outlined" sx={{ px: 2, py: 0.75, mb: 0.75 }} data-testid={`${testId}-used-up-${lot.id}`}>
              <LotRow lot={lot} place={null} inUse={false} mode={mode} />
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  )
}

function LotRow({ lot, place, inUse, mode }: { lot: HopUseLot; place: number | null; inUse: boolean; mode: QuantityDisplay }) {
  const details = [
    lot.crop_year,
    lot.alpha != null ? `${formatFeature(lot.alpha, { key: 'alpha_acid_pct', decimals: 2 })}% AA` : null,
    formatQuantity(lot.on_hand, lot.pack_name, lot.pack_size, lot.unit, mode),
  ].filter(Boolean)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      {place != null && (
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 20 }} data-testid={`use-order-place-${lot.id}`}>
          {place}
        </Typography>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {lot.maker ?? 'None'} ·{' '}
          {lot.product_id ? (
            <Link component={RouterLink} to={`/ingredients/products/${lot.product_id}`}>
              {lotName(lot)}
            </Link>
          ) : (
            lotName(lot)
          )}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {details.join(' · ')}
          </Typography>
          {inUse && <Chip size="small" color="primary" label="In use" data-testid={`use-order-in-use-${lot.id}`} />}
          {lot.status === 'expired' && <StatusChip status="expired" domain="lot" />}
        </Box>
      </Box>
    </Box>
  )
}
