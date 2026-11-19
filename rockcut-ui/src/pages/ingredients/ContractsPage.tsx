import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Box,
  Card,
  CardContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PageHeader from '../../components/PageHeader'
import { PageToolbar } from '../../components/SettingsMenu'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiDelete } from '../../hooks/useApiMutation'
import api from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { contractYears, money, sacksFigure } from '../../lib/purchasing'
import { coloradoToday } from '../../lib/tasks'
import type { Contract, ShortfallRow, SupplierOffer } from '../../lib/types'
import ContractDialog from './ContractDialog'
import PurchasingTabs from './PurchasingTabs'

interface ContractsReply {
  data: Contract[]
  year: number
  /** Every year that has a contract (lead decisions 2, gap 3). */
  years: number[]
  /** Owners and Brewery managers (decision 25). */
  can_write: boolean
}

/**
 * D61 §4.2: the malt contracts for a year, one card per supplier: each
 * product's contracted, on order, received and remaining (over in the
 * warning color, decision 41), and the year's Shortfall. On order and
 * received are in the line's sack size by weight, so they may be part
 * sacks (amendment 17a). The total remaining is what's still owed; over is
 * its own total, never netted (gap 3). New, Edit and Delete only for owners
 * and Brewery managers; everyone else reads. Delete is disabled with the
 * reason once grain was received against the contract (gap 18).
 */
export default function ContractsPage() {
  const [params, setParams] = useSearchParams()
  const thisYear = Number(coloradoToday().slice(0, 4))
  // The URL's year when it's one the API takes (2000–2100), else this year.
  const asked = Number(params.get('year'))
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : thisYear
  const [view, setView] = useState<'contracts' | 'shortfall'>('contracts')
  const [editing, setEditing] = useState<Contract | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Contract | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: reply, isLoading } = useQuery<ContractsReply>({
    queryKey: ['contracts', year],
    queryFn: async () => (await api.get<ContractsReply>('/api/contracts', { params: { year } })).data,
  })
  const { data: shortfall = [] } = useApiList<ShortfallRow>(['contract_shortfall', year], '/api/contracts/shortfall', { year }, { enabled: view === 'shortfall' })
  const { data: offers = [] } = useApiList<SupplierOffer>(['supplier_offers', 'all'], '/api/supplier_offers')
  const remove = useApiDelete((id) => `/api/contracts/${id}`, { invalidateKeys: [['contracts'], ['contract_shortfall']] })
  const contracts = reply?.data ?? []
  const canWrite = !!reply?.can_write
  const offerName = new Map(offers.map((o) => [o.id, o.order_name ? `${o.order_name} · ${Number(o.sack_size_lb)} lb` : `${Number(o.sack_size_lb)} lb ${o.form}`]))
  const years = contractYears(thisYear, reply?.years ?? [], year)

  const doDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
    } catch (err) {
      setError(parseApiError(err))
    }
    setDeleting(null)
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library', to: '/ingredients' }, { label: 'Contracts' }]}
        title="Purchasing"
        action={canWrite ? { label: 'New contract', onClick: () => setEditing('new'), testId: 'contracts-new' } : undefined}
      />
      <PurchasingTabs />
      <PageToolbar>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel id="contracts-year-label">Year</InputLabel>
          <Select labelId="contracts-year-label" label="Year" value={year} onChange={(e) => setParams({ year: String(e.target.value) })} data-testid="contracts-year">
            {years.map((y) => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="contracts" data-testid="contracts-view-contracts">
            Contracts
          </ToggleButton>
          <ToggleButton value="shortfall" data-testid="contracts-view-shortfall">
            Shortfall
          </ToggleButton>
        </ToggleButtonGroup>
      </PageToolbar>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {view === 'shortfall' ? (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" data-testid="contracts-shortfall">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell align="right">Contracted</TableCell>
                <TableCell align="right">Received</TableCell>
                <TableCell align="right">Short</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shortfall.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary">
                      Nothing short in {year}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {shortfall.map((r) => (
                <TableRow key={r.product_id} data-testid={`shortfall-${r.product_id}`}>
                  <TableCell>{r.display_name}</TableCell>
                  <TableCell align="right">{r.contracted_sacks}</TableCell>
                  <TableCell align="right">{sacksFigure(r.received_sacks)}</TableCell>
                  <TableCell align="right">{sacksFigure(r.short_sacks)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!isLoading && contracts.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }} data-testid="contracts-empty">
              No contracts for {year}
            </Typography>
          )}
          {contracts.map((c) => (
            <ContractCard key={c.id} contract={c} offerName={offerName} canWrite={canWrite} onEdit={() => setEditing(c)} onDelete={() => setDeleting(c)} />
          ))}
        </Box>
      )}

      <ContractDialog open={editing !== null} onClose={() => setEditing(null)} contract={editing === 'new' || editing === null ? undefined : editing} year={year} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="Delete contract"
        message={deleting ? `Delete the ${deleting.year} ${deleting.supplier?.name ?? ''} contract? Offer prices it set stay in their history.` : ''}
        loading={remove.isPending}
        testId="contract-delete-confirm"
      />
    </>
  )
}

function ContractCard({ contract: c, offerName, canWrite, onEdit, onDelete }: { contract: Contract; offerName: Map<number, string>; canWrite: boolean; onEdit: () => void; onDelete: () => void }) {
  const sum = (f: (l: Contract['lines'][number]) => number) => c.lines.reduce((n, l) => n + f(l), 0)
  return (
    <Card variant="outlined" data-testid={`contract-${c.id}`}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>
            {c.supplier?.name} · {c.year}
          </Typography>
          {canWrite && (
            <Box sx={{ display: 'flex', flexShrink: 0 }}>
              <Tooltip title="Edit contract">
                <IconButton aria-label="Edit contract" onClick={onEdit} data-testid={`contract-${c.id}-edit`}>
                  <EditIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={c.delete_blocked ?? 'Delete contract'}>
                {/* A span so the reason shows on a disabled button. */}
                <span>
                  <IconButton aria-label="Delete contract" color="error" disabled={!!c.delete_blocked} onClick={onDelete} data-testid={`contract-${c.id}-delete`}>
                    <DeleteIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          )}
        </Box>
        {c.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {c.notes}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell align="right">$ / sack</TableCell>
                <TableCell align="right">Contracted</TableCell>
                <TableCell align="right">$</TableCell>
                <TableCell align="right">On order</TableCell>
                <TableCell align="right">Received</TableCell>
                <TableCell align="right">Received $</TableCell>
                <TableCell align="right">Remaining</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {c.lines.map((l) => (
                <TableRow key={l.id} data-testid={`contract-line-${l.product_id}`}>
                  <TableCell>
                    {l.product.display_name}
                    {l.offer_id && offerName.get(l.offer_id) && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {offerName.get(l.offer_id)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{money(l.price_per_sack)}</TableCell>
                  <TableCell align="right">{l.contracted_sacks}</TableCell>
                  <TableCell align="right">{money(l.contracted_dollars)}</TableCell>
                  <TableCell align="right" data-testid={`contract-line-${l.product_id}-on-order`}>
                    {sacksFigure(l.on_order_sacks)}
                  </TableCell>
                  <TableCell align="right" data-testid={`contract-line-${l.product_id}-received`}>
                    {sacksFigure(l.received_sacks)}
                  </TableCell>
                  <TableCell align="right">{money(l.received_dollars)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: l.over_by ? 'warning.main' : undefined, fontWeight: l.over_by ? 600 : undefined }} data-testid={`contract-line-${l.product_id}-remaining`}>
                    {l.over_by ? `over by ${sacksFigure(l.over_by)}` : sacksFigure(l.remaining_sacks)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ '& td': { fontWeight: 600 } }} data-testid={`contract-${c.id}-total`}>
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell align="right">{sum((l) => l.contracted_sacks)}</TableCell>
                <TableCell align="right">{money(sum((l) => Number(l.contracted_dollars)))}</TableCell>
                <TableCell align="right">{sacksFigure(sum((l) => l.on_order_sacks))}</TableCell>
                <TableCell align="right">{sacksFigure(sum((l) => l.received_sacks))}</TableCell>
                <TableCell align="right">{money(sum((l) => Number(l.received_dollars)))}</TableCell>
                <TableCell align="right" data-testid={`contract-${c.id}-remaining`}>
                  {sacksFigure(c.remaining_sacks)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
        {c.over_sacks > 0 && (
          <Typography variant="body2" sx={{ mt: 1, color: 'warning.main', fontWeight: 600 }} data-testid={`contract-${c.id}-over`}>
            Over: {sacksFigure(c.over_sacks)} {c.over_sacks === 1 ? 'sack' : 'sacks'}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
