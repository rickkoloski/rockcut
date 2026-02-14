import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, FormControl, InputAdornment, InputLabel, MenuItem, Paper, Select, TextField } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { DataGridExtended } from 'datagrid-extended'
import type { ExtendedGridColDef } from 'datagrid-extended'
import type { Ingredient, IngredientCategory } from '../../lib/types'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useFormulaFunctions } from '../../hooks/useFormulaFunctions'
import PageHeader from '../../components/PageHeader'
import IngredientFormDialog from './IngredientFormDialog'

export default function IngredientsList() {
  const navigate = useNavigate()
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [formOpen, setFormOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories'
  )

  const { data: ingredients = [] } = useApiQuery<Ingredient[]>(
    ['ingredients', { category_id: categoryId }],
    '/api/ingredients',
    categoryId ? { category_id: categoryId } : undefined
  )

  const { remoteFunctions } = useFormulaFunctions()

  const filteredIngredients = useMemo(() => {
    if (!search) return ingredients
    const term = search.toLowerCase()
    return ingredients.filter((i) =>
      [i.name, i.category?.name, i.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [ingredients, search])

  const columns: ExtendedGridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      valueGetter: (_value: unknown, row: Ingredient) => row.category?.name ?? '',
    },
    { field: 'notes', headerName: 'Notes', flex: 1 },
    {
      field: 'on_hand',
      headerName: 'On Hand',
      width: 120,
      formula: '=INVENTORY_ON_HAND(id)',
    },
  ]

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Ingredient Library' },
        ]}
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
              <MenuItem key={cat.id} value={cat.id}>
                {cat.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Paper variant="outlined">
        <DataGridExtended
          rows={filteredIngredients}
          columns={columns}
          remoteFunctions={remoteFunctions}
          formulaEditable
          onFormulaChange={(field, formula) => {
            console.log(`[IngredientsList] formula change: ${field} = ${formula ?? '(cleared)'}`)
          }}
          autoHeight
          disableRowSelectionOnClick
          onRowClick={(params) => navigate(`/ingredients/${params.id}`)}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Paper>

      <IngredientFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  )
}
