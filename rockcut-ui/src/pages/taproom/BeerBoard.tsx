import { useMemo, useState, type MouseEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { Delete, Edit, LocalBar, MoreVert, Search } from '@mui/icons-material'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import { useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../components/PageHeader'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import { formatBoardDate, matchesSearch } from '../../lib/beerBoard'
import type { BeerBoardEntry, BeerBoardWriteResult } from '../../lib/types'
import BeerBoardHistory from './BeerBoardHistory'
import DeleteEntryDialog from './DeleteEntryDialog'
import EntryDialog from './EntryDialog'
import RedeemDialog from './RedeemDialog'

/**
 * D37: Taproom → Buy-a-Beer Board. Lines moved off the taproom chalkboard,
 * redeemed beer by beer. Taproom staff (and the Taproom tablet, with a staff
 * code) add, redeem, edit and delete; owners and Taproom managers also get
 * History.
 */
export default function BeerBoard() {
  const qc = useQueryClient()
  const { beerBoardManage } = useAuth()
  const { data: entries = [], isLoading, isError } = useApiQuery<BeerBoardEntry[]>(['beer_board'], '/api/beer_board')

  const [tab, setTab] = useState<'board' | 'history'>('board')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<BeerBoardEntry | null>(null)
  const [adding, setAdding] = useState(false)
  const [redeeming, setRedeeming] = useState<BeerBoardEntry | null>(null)
  const [deleting, setDeleting] = useState<BeerBoardEntry | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; entry: BeerBoardEntry } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Phones: no date columns, and an icon-only Redeem, so the actions stay on screen.
  const theme = useTheme()
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'))

  const rows = useMemo(() => entries.filter((e) => matchesSearch(e, search)), [entries, search])

  const done = (result: BeerBoardWriteResult, verb: string) => {
    setAdding(false)
    setEditing(null)
    setRedeeming(null)
    setDeleting(null)
    qc.invalidateQueries({ queryKey: ['beer_board'] })
    qc.invalidateQueries({ queryKey: ['beer_board_history'] })
    const removed = result.removed && verb.startsWith('Redeemed') ? ' (the last; entry removed)' : ''
    setNotice(`${verb}${removed}${result.recorded_as ? `. Recorded as ${result.recorded_as}` : ''}`)
  }

  // An entry that's already gone (someone else poured the last beer): refresh
  // the list while the dialog says so (S17).
  const refresh = () => qc.invalidateQueries({ queryKey: ['beer_board'] })

  const columns: GridColDef<BeerBoardEntry>[] = [
    { field: 'recipient_name', headerName: 'For', flex: 1.2, minWidth: isPhone ? 90 : 140 },
    { field: 'purchaser_name', headerName: 'Bought by', flex: 1.2, minWidth: isPhone ? 90 : 140 },
    { field: 'beers_remaining', headerName: isPhone ? 'Left' : 'Beers left', type: 'number', width: isPhone ? 64 : 110 },
    {
      field: 'moved_off_board_at',
      headerName: 'Moved off board',
      minWidth: 140,
      flex: 0.8,
      valueFormatter: (value: string) => formatBoardDate(value),
    },
    {
      field: 'imported_at',
      headerName: 'Imported',
      minWidth: 120,
      flex: 0.7,
      valueFormatter: (value: string | null) => formatBoardDate(value),
    },
    {
      field: 'actions',
      headerName: '',
      width: isPhone ? 84 : 150,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      align: 'right',
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
          {isPhone ? (
            <Tooltip title="Redeem">
              <IconButton
                size="small"
                color="primary"
                aria-label={`Redeem for ${row.recipient_name}`}
                onClick={() => setRedeeming(row)}
                data-testid={`board-redeem-${row.id}`}
              >
                <LocalBar fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<LocalBar />}
              onClick={() => setRedeeming(row)}
              data-testid={`board-redeem-${row.id}`}
            >
              Redeem
            </Button>
          )}
          <IconButton
            size="small"
            aria-label={`More actions for ${row.recipient_name}`}
            onClick={(e: MouseEvent<HTMLElement>) => setMenu({ anchor: e.currentTarget, entry: row })}
            data-testid={`board-menu-${row.id}`}
          >
            <MoreVert fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Buy-a-Beer Board' }]}
        title="Buy-a-Beer Board"
        action={tab === 'board' ? { label: 'Add from chalkboard', onClick: () => setAdding(true), testId: 'board-add' } : undefined}
      />

      {beerBoardManage && (
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Board" value="board" data-testid="board-tab-board" />
          <Tab label="History" value="history" data-testid="board-tab-history" />
        </Tabs>
      )}

      {tab === 'history' && beerBoardManage ? (
        <BeerBoardHistory />
      ) : (
        <>
          <TextField
            placeholder="Search For or Bought by"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ mb: 2, width: { xs: '100%', sm: 360 } }}
            slotProps={{
              htmlInput: { 'data-testid': 'board-search' },
              input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> },
            }}
          />
          {isError && <Alert severity="error">Couldn't load the board.</Alert>}
          <Paper sx={{ border: '1px solid', borderColor: 'divider' }} data-testid="board-grid">
            <DataGridExtended
              rows={rows}
              columns={columns}
              loading={isLoading}
              autoHeight
              disableRowSelectionOnClick
              columnVisibilityModel={{ moved_off_board_at: !isPhone, imported_at: !isPhone }}
              initialState={{
                sorting: { sortModel: [{ field: 'recipient_name', sort: 'asc' }] },
                pagination: { paginationModel: { pageSize: 100 } },
              }}
              pageSizeOptions={[25, 50, 100]}
              localeText={{
                noRowsLabel: search ? 'Nothing matches that search.' : 'Nothing on the board yet.',
              }}
            />
          </Paper>
        </>
      )}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setEditing(menu!.entry)
            setMenu(null)
          }}
          data-testid="board-menu-edit"
        >
          <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
          Edit
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDeleting(menu!.entry)
            setMenu(null)
          }}
          data-testid="board-menu-delete"
        >
          <ListItemIcon><Delete fontSize="small" /></ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      <EntryDialog
        key={editing ? `edit-${editing.id}` : adding ? 'add' : 'closed'}
        open={adding || !!editing}
        entry={editing}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        onDone={done}
        onGone={refresh}
      />
      <RedeemDialog key={redeeming?.id ?? 'none'} entry={redeeming} onClose={() => setRedeeming(null)} onDone={done} onGone={refresh} />
      <DeleteEntryDialog entry={deleting} onClose={() => setDeleting(null)} onDone={done} onGone={refresh} />

      <Snackbar
        open={!!notice}
        autoHideDuration={5000}
        onClose={() => setNotice(null)}
        message={notice ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ content: { 'data-testid': 'board-notice' } as object }}
      />
    </>
  )
}
