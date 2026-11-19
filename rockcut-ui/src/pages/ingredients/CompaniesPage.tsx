import { useMemo, useState } from 'react'
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  FormControlLabel,
  InputAdornment,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import PageHeader from '../../components/PageHeader'
import { PageToolbar } from '../../components/SettingsMenu'
import { useApiList } from '../../hooks/useApiQuery'
import { ROLE_LABELS } from '../../lib/inventory'
import type { Party } from '../../lib/types'
import PartyDialog from './PartyDialog'

function Roles({ party }: { party: Party }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {(party.roles ?? []).map((r) => (
        <Chip key={r} size="small" label={ROLE_LABELS[r] ?? r} data-testid={`party-${party.id}-role-${r}`} />
      ))}
      {!party.active && <Chip size="small" variant="outlined" label="Inactive" />}
    </Box>
  )
}

/**
 * D60 §3.2: Brewery → Ingredients → Companies: maltsters, suppliers and
 * partner breweries. A company in use can't be deleted, only deactivated.
 */
export default function CompaniesPage() {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Party | null>(null)
  const [adding, setAdding] = useState(false)
  const { data: parties = [] } = useApiList<Party>(['parties'], '/api/parties')

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase()
    return parties.filter((p) => (showInactive || p.active) && (!t || [p.name, p.notes].filter(Boolean).join(' ').toLowerCase().includes(t)))
  }, [parties, search, showInactive])

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library', to: '/ingredients' }, { label: 'Companies' }]}
        title="Companies"
        action={{ label: 'Add company', onClick: () => setAdding(true), testId: 'companies-add' }}
      />
      <PageToolbar>
        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: { xs: '100%', sm: 260 } }}
        />
        <FormControlLabel control={<Switch checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />} label="Show inactive" />
      </PageToolbar>

      {phone ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {shown.map((p) => (
            <Card key={p.id} variant="outlined">
              <CardActionArea onClick={() => setEditing(p)} data-testid={`company-${p.id}`}>
                <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                    {p.name}
                  </Typography>
                  <Roles party={p} />
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      ) : (
        <Paper variant="outlined">
          <Table size="small" data-testid="companies-table">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Roles</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((p) => (
                <TableRow key={p.id} hover sx={{ cursor: 'pointer', opacity: p.active ? 1 : 0.6 }} onClick={() => setEditing(p)} data-testid={`company-${p.id}`}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>
                    <Roles party={p} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {p.notes ?? ''}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      {shown.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No companies found
        </Typography>
      )}

      <PartyDialog open={adding} onClose={() => setAdding(false)} />
      {/* The live row, so Delete follows delete_blocked after a refetch (as lots do, lead decisions 4). */}
      <PartyDialog open={!!editing} onClose={() => setEditing(null)} party={editing ? (parties.find((p) => p.id === editing.id) ?? editing) : undefined} />
    </>
  )
}
