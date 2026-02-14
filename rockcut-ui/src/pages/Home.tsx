import { Box, Card, CardContent, Grid, Paper, Typography } from '@mui/material'
import { type GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import { useNavigate } from 'react-router-dom'
import { useApiQuery } from '../hooks/useApiQuery'
import StatusChip from '../components/StatusChip'
import type { Brand, Batch, Recipe } from '../lib/types'

export default function Home() {
  const navigate = useNavigate()
  const { data: brands } = useApiQuery<Brand[]>(['brands'], '/api/brands')
  const { data: batches } = useApiQuery<Batch[]>(['batches'], '/api/batches')
  const { data: recipes } = useApiQuery<Recipe[]>(['recipes'], '/api/recipes')

  const activeBatches = batches?.filter(b => b.status !== 'completed' && b.status !== 'dumped') ?? []

  const batchColumns: GridColDef[] = [
    { field: 'batch_number', headerName: 'Batch #', flex: 1 },
    { field: 'brand_name', headerName: 'Brand', flex: 1, valueGetter: (_value: unknown, row: Batch) => row.brand?.name ?? '' },
    { field: 'status', headerName: 'Status', width: 130, renderCell: (params) => <StatusChip status={params.value} domain="batch" /> },
    { field: 'actual_og', headerName: 'OG', width: 90 },
    { field: 'ferm_start_date', headerName: 'Ferm Start', width: 120 },
  ]

  const recipeColumns: GridColDef[] = [
    { field: 'brand_name', headerName: 'Brand', flex: 1, valueGetter: (_value: unknown, row: Recipe) => row.brand?.name ?? '' },
    { field: 'version', headerName: 'Version', width: 100 },
    { field: 'status', headerName: 'Status', width: 110, renderCell: (params) => <StatusChip status={params.value} domain="recipe" /> },
    { field: 'batch_size', headerName: 'Batch Size', width: 110 },
  ]

  const stats = [
    { label: 'Brands', value: brands?.length ?? 0 },
    { label: 'Recipes', value: recipes?.length ?? 0 },
    { label: 'Active Batches', value: activeBatches.length },
    { label: 'Completed', value: batches?.filter(b => b.status === 'completed').length ?? 0 },
  ]

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Dashboard</Typography>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {stats.map(s => (
          <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h3" color="primary">{s.value}</Typography>
                <Typography variant="body2" color="text.secondary">{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h5" gutterBottom>Active Batches</Typography>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 4 }}>
        <DataGridExtended
          rows={activeBatches}
          columns={batchColumns}
          autoHeight
          disableRowSelectionOnClick
          onRowClick={(params) => navigate(`/batches/${params.id}`)}
          pageSizeOptions={[5, 10, 25]}
          initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
          sx={{ cursor: 'pointer' }}
        />
      </Paper>

      <Typography variant="h5" gutterBottom>Recent Recipes</Typography>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={recipes?.slice(0, 10) ?? []}
          columns={recipeColumns}
          autoHeight
          disableRowSelectionOnClick
          onRowClick={(params) => {
            const recipe = recipes?.find(r => r.id === params.id)
            if (recipe) navigate(`/brands/${recipe.brand_id}/recipes/${recipe.id}`)
          }}
          pageSizeOptions={[5, 10, 25]}
          initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
          sx={{ cursor: 'pointer' }}
        />
      </Paper>
    </Box>
  )
}
