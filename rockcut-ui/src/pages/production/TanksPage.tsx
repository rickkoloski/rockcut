import { useState } from 'react'
import { Alert, Box, Button, Chip, Collapse, IconButton, Paper, Snackbar, Tooltip, Typography } from '@mui/material'
import { Edit, ExpandLess, ExpandMore, RemoveCircleOutline, Restore } from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiQuery } from '../../hooks/useApiQuery'
import api from '../../lib/api'
import {
  TANKS_KEY,
  headlineOutage,
  kindLabel,
  locationLabel,
  prodError,
  prodPath,
  shortPeriod,
  type Outage,
  type Tank,
} from '../../lib/production'
import OrderedList from './OrderedList'
import TankDialog from './TankDialog'
import OutageDialog from './OutageDialog'

const NO_TANKS: Tank[] = []

/** "Out Oct 27–Nov 2", red while it's going on; "+1" when more are coming. */
export function OutageChip({ tank }: { tank: Tank }) {
  const head = headlineOutage(tank)
  if (!head) return null
  const { outage, more } = head
  return (
    <Chip
      size="small"
      color="error"
      variant={outage.state === 'now' ? 'filled' : 'outlined'}
      label={`Out ${shortPeriod(outage)}${more ? ` +${more}` : ''}`}
      title={`Out of service ${outage.label}${outage.reason ? ` · ${outage.reason}` : ''}`}
      data-testid={`tank-out-chip-${tank.id}`}
    />
  )
}

/**
 * D46 §3.2 Tanks (`/brewery/production/tanks`): the active tanks in display
 * order (drag or arrows), Add / Edit with out-of-service periods, Retire,
 * and a Retired section with Restore.
 */
export default function TanksPage() {
  const qc = useQueryClient()
  const { data: all = NO_TANKS, isLoading, error: loadError } = useApiQuery<Tank[]>(TANKS_KEY, prodPath('tanks'))
  const active = all.filter((t) => !t.retired_at)
  const retired = all.filter((t) => t.retired_at)
  // Open dialogs hold ids, so they show the tank as last fetched.
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [outage, setOutage] = useState<{ tankId: number; outage: Outage | null } | null>(null)
  const [retiring, setRetiring] = useState<Tank | null>(null)
  const [showRetired, setShowRetired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: TANKS_KEY })
  const editingTank = typeof editing === 'number' ? all.find((t) => t.id === editing) ?? null : null
  const outageTank = outage ? all.find((t) => t.id === outage.tankId) : undefined

  const retire = async (tank: Tank) => {
    setBusy(true)
    try {
      await api.delete(prodPath('tanks', tank.id))
      setError(null)
      setToast(`${tank.name} retired.`)
    } catch (err) {
      setError(prodError(err))
    } finally {
      setRetiring(null)
      setBusy(false)
      refresh()
    }
  }

  const restore = async (tank: Tank) => {
    try {
      await api.post(prodPath('tanks', tank.id, 'restore'))
      setError(null)
      setToast(`${tank.name} is back, at the bottom of the list.`)
    } catch (err) {
      setError(prodError(err))
    } finally {
      refresh()
    }
  }

  return (
    <Box>
      <PageHeader
        breadcrumbs={[{ label: 'Production', to: '/brewery/production' }, { label: 'Tanks' }]}
        title="Tanks"
        action={{ label: 'Add tank', onClick: () => setEditing('new'), testId: 'tank-add' }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The schedule shows tanks in this order. Drag a tank, or use the arrows, to move it.
      </Typography>
      {loadError && <Alert severity="error">{prodError(loadError)}</Alert>}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)} data-testid="tanks-error">
          {error}
        </Alert>
      )}
      {isLoading ? (
        <Typography variant="body2">Loading…</Typography>
      ) : active.length === 0 ? (
        <Typography variant="body2" color="text.secondary" data-testid="tanks-empty">
          No tanks yet. Add the first one.
        </Typography>
      ) : (
        <OrderedList
          items={active}
          testId="tanks-list"
          label={(t) => t.name}
          onReorder={(ids) => api.post(prodPath('tanks', 'reorder'), { ids }).finally(refresh)}
          render={(t) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 160 }}>
                <Typography sx={{ fontWeight: 600 }} data-testid={`tank-name-${t.id}`}>
                  {t.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {kindLabel(t.kind)} · {t.capacity_bbl} bbl · {locationLabel(t.location)}
                </Typography>
              </Box>
              <OutageChip tank={t} />
              <Box sx={{ display: 'flex' }}>
                <Tooltip title="Edit and out of service">
                  <IconButton size="small" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t.id)} data-testid={`tank-edit-${t.id}`}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Retire">
                  <IconButton size="small" aria-label={`Retire ${t.name}`} onClick={() => setRetiring(t)} data-testid={`tank-retire-${t.id}`}>
                    <RemoveCircleOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          )}
        />
      )}

      {retired.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Button
            size="small"
            onClick={() => setShowRetired((v) => !v)}
            endIcon={showRetired ? <ExpandLess /> : <ExpandMore />}
            data-testid="tanks-retired-toggle"
          >
            Retired ({retired.length})
          </Button>
          <Collapse in={showRetired}>
            <Box data-testid="tanks-retired">
              {retired.map((t) => (
                <Paper key={t.id} variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, mt: 0.75 }} data-testid={`tank-retired-row-${t.id}`}>
                  <Typography sx={{ flex: 1 }} color="text.secondary">
                    {t.name} · {kindLabel(t.kind)} · {t.capacity_bbl} bbl
                  </Typography>
                  <Button size="small" startIcon={<Restore />} onClick={() => restore(t)} data-testid={`tank-restore-${t.id}`}>
                    Restore
                  </Button>
                </Paper>
              ))}
            </Box>
          </Collapse>
        </Box>
      )}

      {editing !== null && (editing === 'new' || editingTank) && (
        <TankDialog
          tank={editingTank}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            setToast(message)
            refresh()
          }}
          onOutage={(tank, o) => setOutage({ tankId: tank.id, outage: o })}
        />
      )}
      {outage && outageTank && (
        <OutageDialog
          tank={outageTank}
          outage={outage.outage}
          onClose={() => setOutage(null)}
          onSaved={(message) => {
            setOutage(null)
            setToast(message)
            refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={!!retiring}
        onClose={() => setRetiring(null)}
        onConfirm={() => retiring && retire(retiring)}
        title="Retire tank"
        message={retiring ? `Retire ${retiring.name}? It leaves the schedule. Batches that used it keep its name.` : ''}
        confirmLabel="Retire"
        loading={busy}
      />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} data-testid="production-toast" />
    </Box>
  )
}
