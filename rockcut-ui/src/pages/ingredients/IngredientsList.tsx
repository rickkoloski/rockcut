import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Chip, Collapse, FormControl, IconButton, InputAdornment,
  InputLabel, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SearchIcon from '@mui/icons-material/Search'
import type { Ingredient, IngredientCategory, IngredientLotSummary } from '../../lib/types'
import { useApiQuery } from '../../hooks/useApiQuery'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import IngredientFormDialog from './IngredientFormDialog'

function LotValues({ lot }: { lot: IngredientLotSummary }) {
  const values: string[] = []
  if (lot.alpha_acid != null)       values.push(`AA ${lot.alpha_acid}%`)
  if (lot.color_lovibond != null)   values.push(`${lot.color_lovibond}°L`)
  if (lot.extract_potential_fgdb != null) values.push(`FGDB ${lot.extract_potential_fgdb}%`)
  if (lot.attenuation != null)      values.push(`Atten ${lot.attenuation}%`)
  if (values.length === 0) return null
  return (
    <Typography variant="body2" color="text.secondary" component="span">
      {values.join(' · ')}
    </Typography>
  )
}

function IngredientRow({
  ingredient,
  onClick,
}: {
  ingredient: Ingredient
  onClick: () => void
}) {
  const lots = ingredient.lots ?? []
  const [expanded, setExpanded] = useState(true)

  return (
    <>
      <TableRow
        hover
        sx={{ cursor: 'pointer', '& td': { borderBottom: expanded && lots.length > 0 ? 'none' : undefined } }}
        onClick={onClick}
      >
        <TableCell padding="none" sx={{ width: 40, pl: 0.5 }}>
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            disabled={lots.length === 0}
          >
            {expanded && lots.length > 0
              ? <ExpandMoreIcon fontSize="small" />
              : <ChevronRightIcon fontSize="small" sx={{ color: lots.length === 0 ? 'transparent' : undefined }} />
            }
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography variant="body2" fontWeight={500}>{ingredient.name}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" color="text.secondary">{ingredient.notes ?? ''}</Typography>
        </TableCell>
        <TableCell align="right">
          {lots.filter((l) => l.status === 'available').length > 0 && (
            <Chip
              label={`${lots.filter((l) => l.status === 'available').length} on hand`}
              size="small"
              variant="outlined"
            />
          )}
        </TableCell>
      </TableRow>

      {lots.length > 0 && (
        <TableRow>
          <TableCell colSpan={4} sx={{ p: 0, borderBottom: expanded ? undefined : 'none' }}>
            <Collapse in={expanded} unmountOnExit>
              <Box sx={{ backgroundColor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                {lots.map((lot) => (
                  <Box
                    key={lot.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      pl: 7,
                      pr: 2,
                      py: 0.75,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <Typography variant="body2" sx={{ minWidth: 90, color: 'text.secondary' }}>
                      {lot.lot_number ?? '—'}
                    </Typography>
                    <Typography variant="body2" sx={{ minWidth: 110 }}>
                      {lot.supplier ?? '—'}
                    </Typography>
                    <StatusChip status={lot.status} domain="lot" />
                    <LotValues lot={lot} />
                  </Box>
                ))}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

export default function IngredientsList() {
  const navigate = useNavigate()
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories'
  )

  // Default to Grains once categories load
  useEffect(() => {
    if (categories.length > 0 && categoryId === '') {
      const grains = categories.find((c) => c.name === 'Grains')
      if (grains) setCategoryId(grains.id)
    }
  }, [categories])

  const { data: ingredients = [] } = useApiQuery<Ingredient[]>(
    ['ingredients', { category_id: categoryId }],
    '/api/ingredients',
    categoryId ? { category_id: categoryId } : undefined
  )

  const filtered = useMemo(() => {
    if (!search) return ingredients
    const term = search.toLowerCase()
    return ingredients.filter((i) =>
      [i.name, i.category?.name, i.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [ingredients, search])

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Ingredient Library' }]}
        title="Ingredient Library"
        action={{ label: 'Add Ingredient', onClick: () => setFormOpen(true) }}
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: 260 }}
        />
        <FormControl sx={{ minWidth: 220 }} size="small">
          <InputLabel>Category</InputLabel>
          <Select
            value={categoryId}
            label="Category"
            onChange={(e) => setCategoryId(e.target.value as number | '')}
          >
            <MenuItem value="">All Categories</MenuItem>
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="none" sx={{ width: 40 }} />
              <TableCell>Name</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell align="right" sx={{ pr: 2 }}>On Hand</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No ingredients found
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {filtered.map((ingredient) => (
              <IngredientRow
                key={ingredient.id}
                ingredient={ingredient}
                onClick={() => navigate(`/ingredients/${ingredient.id}`)}
              />
            ))}
          </TableBody>
        </Table>
      </Paper>

      <IngredientFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  )
}
