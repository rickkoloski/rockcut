import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PageHeader from '../../components/PageHeader'
import { PageToolbar, SettingsGear } from '../../components/SettingsMenu'
import api from '../../lib/api'
import { useApiList } from '../../hooks/useApiQuery'
import { brinkStateText, countText, emptyWeightText, lbText, shortDate, sourcesText, strainsText } from '../../lib/yeast'
import type { IngredientCategory, YeastBrink } from '../../lib/types'
import { AdjustBrinkDialog, BrinkHistoryDialog, CleanBrinkDialog, CountBrinkDialog, DumpBrinkDialog, PitchBrinkDialog } from './BrinkDialogs'
import YeastSettingsDialog from './YeastSettingsDialog'

interface BrinksReply {
  data: YeastBrink[]
  can_manage: boolean
}

type Action = 'pitch' | 'count' | 'adjust' | 'dump' | 'clean' | 'history'

/** D64 §6.3: Strains (the Yeast Strains library) and Brinks, side by side. */
export function YeastTabs({ value, strainsHref }: { value: 'strains' | 'brinks'; strainsHref: string }) {
  return (
    <Tabs value={value} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
      <Tab value="strains" label="Strains" component={RouterLink} to={strainsHref} data-testid="yeast-tab-strains" />
      <Tab value="brinks" label="Brinks" component={RouterLink} to="/ingredients/brinks" data-testid="yeast-tab-brinks" />
    </Tabs>
  )
}

/**
 * D64 §6.3: the brinks, in order: an empty one ("YB1 · empty", "· dirty since
 * 11/20"), or its yeast: strains or "Co-ferment: …", generation, on hand,
 * the count in effect ("before the 11/20 harvest"), Recount due, the sources
 * and the harvest date. Actions: Pitch, Add count, Adjust weight, Dump brink,
 * Mark clean (a dirty brink), History. Cards at phone width, rows on desktop.
 */
export default function BrinksPage() {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const { data: reply, isLoading } = useQuery<BrinksReply>({
    queryKey: ['yeast_brinks'],
    queryFn: async () => (await api.get<BrinksReply>('/api/yeast/brinks')).data,
  })
  const [open, setOpen] = useState<{ action: Action; brink: YeastBrink } | null>(null)
  const [settings, setSettings] = useState(false)
  const brinks = reply?.data ?? []
  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const yeast = categories.find((c) => c.key === 'yeast' && c.parent_id == null)
  const strainsHref = yeast ? `/ingredients?category=${yeast.id}` : '/ingredients'
  const close = () => setOpen(null)
  const act = (action: Action) => (brink: YeastBrink) => setOpen({ action, brink })

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredients', to: strainsHref }, { label: 'Brinks' }]} title="Yeast brinks" />
      <YeastTabs value="brinks" strainsHref={strainsHref} />
      <PageToolbar
        end={
          <SettingsGear label="Yeast settings" testid="brinks-settings">
            {(closeMenu) => (
              <MenuItem
                onClick={() => {
                  closeMenu()
                  setSettings(true)
                }}
                data-testid="brinks-settings-yeast"
              >
                <ListItemText primary="Yeast settings" secondary="Brinks and strain types" />
              </MenuItem>
            )}
          </SettingsGear>
        }
      >
        <Typography variant="body2" color="text.secondary">
          Harvests are recorded from the Yeast harvest step.
        </Typography>
      </PageToolbar>

      {isLoading ? (
        <CircularProgress size={28} />
      ) : phone ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="brinks-cards">
          {brinks.map((b) => (
            <Card key={b.id} variant="outlined" data-testid={`brink-card-${b.id}`}>
              <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }} data-testid={`brink-state-${b.id}`}>
                      {brinkStateText(b)}
                    </Typography>
                    <BrinkDetails brink={b} />
                  </Box>
                  <Actions brink={b} onPick={(a) => act(a)(b)} />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small" data-testid="brinks-table">
            <TableHead>
              <TableRow>
                <TableCell>Brink</TableCell>
                <TableCell>Yeast</TableCell>
                <TableCell align="right">On hand</TableCell>
                <TableCell>Count</TableCell>
                <TableCell>Harvested</TableCell>
                <TableCell>Sources</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {brinks.map((b) => (
                <TableRow key={b.id} data-testid={`brink-row-${b.id}`}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="body2" fontWeight={600}>
                      {b.name}
                    </Typography>
                    {emptyWeightText(b) && (
                      <Typography variant="caption" color="text.secondary">
                        {`Empty ${lbText(b.empty_weight_lb)}`}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell data-testid={`brink-state-${b.id}`}>
                    {b.yeast ? (
                      `${strainsText(b.yeast)} · gen ${b.yeast.generation}`
                    ) : (
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <span>Empty</span>
                        {b.dirty && <Chip size="small" color="warning" label={`Dirty since ${shortDate(b.dirty_since)}`} data-testid={`brink-dirty-${b.id}`} />}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} data-testid={`brink-on-hand-${b.id}`}>
                    {b.yeast ? lbText(b.yeast.on_hand_lb) : '—'}
                  </TableCell>
                  <TableCell data-testid={`brink-count-${b.id}`}>
                    {b.yeast ? countText(b.yeast) : '—'}
                    {b.recount_due && <Chip size="small" color="info" label="Recount due" sx={{ ml: 1 }} data-testid={`brink-recount-due-${b.id}`} />}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{b.yeast ? shortDate(b.yeast.harvested_on) : '—'}</TableCell>
                  <TableCell>{b.yeast ? sourcesText(b.yeast) : ''}</TableCell>
                  <TableCell align="right">
                    <Actions brink={b} onPick={(a) => act(a)(b)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {open?.action === 'pitch' && <PitchBrinkDialog brink={open.brink} onClose={close} />}
      {open?.action === 'count' && <CountBrinkDialog brink={open.brink} onClose={close} />}
      {open?.action === 'adjust' && <AdjustBrinkDialog brink={open.brink} onClose={close} />}
      {open?.action === 'dump' && <DumpBrinkDialog brink={open.brink} onClose={close} />}
      {open?.action === 'clean' && <CleanBrinkDialog brink={open.brink} onClose={close} />}
      {open?.action === 'history' && <BrinkHistoryDialog brink={open.brink} onClose={close} />}
      <YeastSettingsDialog open={settings} onClose={() => setSettings(false)} />
    </>
  )
}

/** A card's lines under the state: dirty, the count, Recount due, the sources. */
function BrinkDetails({ brink: b }: { brink: YeastBrink }) {
  const lines = b.yeast
    ? [countText(b.yeast), `Harvested ${shortDate(b.yeast.harvested_on)}`, sourcesText(b.yeast), emptyWeightText(b)]
    : [emptyWeightText(b)]
  return (
    <>
      {lines.filter(Boolean).map((l) => (
        <Typography key={l} variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: 'anywhere' }}>
          {l}
        </Typography>
      ))}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
        {b.recount_due && <Chip size="small" color="info" label="Recount due" />}
        {b.dirty && <Chip size="small" color="warning" label="Dirty" />}
      </Box>
    </>
  )
}

/** The brink's actions; those that don't apply to its state are disabled. */
function Actions({ brink: b, onPick }: { brink: YeastBrink; onPick: (a: Action) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const has = !!b.yeast
  const items: { action: Action; label: string; enabled: boolean }[] = [
    { action: 'pitch', label: 'Pitch', enabled: has },
    { action: 'count', label: 'Add count', enabled: has },
    { action: 'adjust', label: 'Adjust weight', enabled: has },
    { action: 'dump', label: 'Dump brink', enabled: has },
    { action: 'clean', label: 'Mark clean', enabled: b.dirty },
    { action: 'history', label: 'History', enabled: true },
  ]
  return (
    <>
      <Button size="small" endIcon={<MoreVertIcon />} onClick={(e) => setAnchor(e.currentTarget)} aria-label={`${b.name} actions`} data-testid={`brink-actions-${b.id}`}>
        Actions
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {items.map((i) => (
          <MenuItem
            key={i.action}
            disabled={!i.enabled}
            onClick={() => {
              setAnchor(null)
              onPick(i.action)
            }}
            data-testid={`brink-action-${i.action}`}
          >
            {i.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
