import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Paper, FormControl, InputLabel, Select, MenuItem, Box } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import type { Ingredient, IngredientCategory } from '../../lib/types'
import { useApiQuery } from '../../hooks/useApiQuery'
import PageHeader from '../../components/PageHeader'
import IngredientFormDialog from './IngredientFormDialog'

export default function IngredientsList() {
  const navigate = useNavigate()
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [formOpen, setFormOpen] = useState(false)

  const { data: categories = [] } = useApiQuery<IngredientCategory[]>(
    ['ingredient_categories'],
    '/api/ingredient_categories'
  )

  const { data: ingredients = [] } = useApiQuery<Ingredient[]>(
    ['ingredients', { category_id: categoryId }],
    '/api/ingredients',
    categoryId ? { category_id: categoryId } : undefined
  )

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      valueGetter: (_value: unknown, row: Ingredient) => row.category?.name ?? '',
    },
    { field: 'notes', headerName: 'Notes', flex: 1 },
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

      <Box sx={{ mb: 2 }}>
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
          rows={ingredients}
          columns={columns}
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
