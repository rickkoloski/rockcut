import { Box, Typography, Paper } from '@mui/material'
import { type GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'

const columns: GridColDef[] = [
  { field: 'name', headerName: 'Recipe', width: 220, editable: true },
  { field: 'style', headerName: 'Style', width: 160 },
  { field: 'batchSize', headerName: 'Batch (gal)', width: 110, type: 'number' },
  { field: 'og', headerName: 'OG', width: 90, type: 'number' },
  { field: 'fg', headerName: 'FG', width: 90, type: 'number' },
  { field: 'abv', headerName: 'ABV %', width: 90, type: 'number' },
  { field: 'ibu', headerName: 'IBU', width: 80, type: 'number' },
  { field: 'srm', headerName: 'SRM', width: 80, type: 'number' },
  { field: 'status', headerName: 'Status', width: 120 },
]

const rows = [
  { id: 1, name: 'Rockcut IPA', style: 'American IPA', batchSize: 5, og: 1.065, fg: 1.012, abv: 7.0, ibu: 65, srm: 8, status: 'Active' },
  { id: 2, name: 'Granite Stout', style: 'Irish Dry Stout', batchSize: 5, og: 1.048, fg: 1.012, abv: 4.7, ibu: 35, srm: 38, status: 'Active' },
  { id: 3, name: 'Shield Wheat', style: 'American Wheat', batchSize: 10, og: 1.050, fg: 1.010, abv: 5.2, ibu: 18, srm: 4, status: 'Draft' },
  { id: 4, name: 'Quarry Amber', style: 'American Amber Ale', batchSize: 5, og: 1.055, fg: 1.014, abv: 5.4, ibu: 30, srm: 15, status: 'Active' },
  { id: 5, name: 'Bedrock Brown', style: 'American Brown Ale', batchSize: 5, og: 1.052, fg: 1.013, abv: 5.1, ibu: 28, srm: 20, status: 'Retired' },
  { id: 6, name: 'Ledge Lager', style: 'American Lager', batchSize: 10, og: 1.044, fg: 1.008, abv: 4.7, ibu: 12, srm: 3, status: 'Draft' },
]

export default function Recipes() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Recipes
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Click any cell in the Recipe column to edit inline. This grid is powered by the
        datagrid-extended component library.
      </Typography>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={rows}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
          }}
        />
      </Paper>
    </Box>
  )
}
