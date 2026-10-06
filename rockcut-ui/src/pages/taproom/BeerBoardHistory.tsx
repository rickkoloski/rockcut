import { useEffect, useState } from 'react'
import { Alert, Box, Button, InputAdornment, Paper, TextField } from '@mui/material'
import { Download, Search } from '@mui/icons-material'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import api, { download } from '../../lib/api'
import parseApiError from '../../lib/parseApiError'
import { boardFileDate, formatBoardDateTime } from '../../lib/beerBoard'
import type { BeerBoardEvent } from '../../lib/types'

const ACTION_LABEL: Record<BeerBoardEvent['action'], string> = {
  created: 'Added',
  redeemed: 'Redeemed',
  edited: 'Edited',
  deleted: 'Deleted',
}

const columns: GridColDef<BeerBoardEvent>[] = [
  {
    field: 'inserted_at',
    headerName: 'When',
    minWidth: 180,
    flex: 1,
    sortable: false,
    valueFormatter: (value: string) => formatBoardDateTime(value),
  },
  {
    field: 'actor_name',
    headerName: 'Who',
    minWidth: 180,
    flex: 1.2,
    sortable: false,
    valueGetter: (_v, row) => `${row.actor_name ?? '—'}${row.on_shared_device ? ' on Shared Device' : ''}`,
  },
  {
    field: 'action',
    headerName: 'Action',
    minWidth: 110,
    sortable: false,
    valueGetter: (_v, row) => `${ACTION_LABEL[row.action]}${row.source === 'import' ? ' (import)' : ''}`,
  },
  { field: 'recipient_name', headerName: 'For', minWidth: 140, flex: 1, sortable: false },
  { field: 'purchaser_name', headerName: 'Bought by', minWidth: 140, flex: 1, sortable: false },
  {
    field: 'change',
    headerName: 'Beers',
    minWidth: 100,
    sortable: false,
    valueGetter: (_v, row) =>
      row.action === 'created' ? String(row.beers_after) : `${row.beers_before} → ${row.beers_after}`,
  },
]

interface Page {
  data: BeerBoardEvent[]
  total: number
  page: number
  per_page: number
}

/** D37: the board's change log (owners and Taproom managers), newest first. */
export default function BeerBoardHistory() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportHistory = async () => {
    setExportError(null)
    try {
      await download('/api/beer_board/history/export.csv', `buy-a-beer-board-history-${boardFileDate()}.csv`)
    } catch (err) {
      setExportError(parseApiError(err))
    }
  }

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isError } = useQuery<Page>({
    queryKey: ['beer_board_history', q, page],
    queryFn: async () => (await api.get<Page>('/api/beer_board/history', { params: { q, page: page + 1 } })).data,
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          placeholder="Search For or Bought by"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: { xs: '100%', sm: 360 } }}
          slotProps={{
            htmlInput: { 'data-testid': 'board-history-search' },
            input: { startAdornment: <InputAdornment position="start"><Search /></InputAdornment> },
          }}
        />
        <Button variant="outlined" startIcon={<Download />} onClick={exportHistory} data-testid="board-history-export">
          Export CSV
        </Button>
      </Box>
      {exportError && <Alert severity="error">Export failed: {exportError}</Alert>}
      {isError && <Alert severity="error">Couldn't load the history.</Alert>}
      <Paper sx={{ border: '1px solid', borderColor: 'divider' }} data-testid="board-history">
        <DataGridExtended
          rows={data?.data ?? []}
          columns={columns}
          loading={isLoading}
          autoHeight
          disableRowSelectionOnClick
          disableColumnMenu
          paginationMode="server"
          rowCount={data?.total ?? 0}
          pageSizeOptions={[50]}
          paginationModel={{ page, pageSize: 50 }}
          onPaginationModelChange={(m) => setPage(m.page)}
          localeText={{ noRowsLabel: q ? 'Nothing matches that search.' : 'No changes yet.' }}
        />
      </Paper>
    </>
  )
}
