import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Paper, Typography, Grid, Box, Button, IconButton, Tooltip } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import type { Ingredient, IngredientLotSummary } from '../../lib/types'
import { useApiQuery } from '../../hooks/useApiQuery'
import { useApiDelete } from '../../hooks/useApiMutation'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import ConfirmDialog from '../../components/ConfirmDialog'
import IngredientFormDialog from './IngredientFormDialog'
import IngredientLotDialog from './IngredientLotDialog'

export default function IngredientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [lotDialogOpen, setLotDialogOpen] = useState(false)
  const [editingLot, setEditingLot] = useState<IngredientLotSummary | undefined>()

  const ingredientId = Number(id)

  const { data: ingredient } = useApiQuery<Ingredient>(
    ['ingredient', ingredientId],
    `/api/ingredients/${id}`
  )

  const deleteIngredient = useApiDelete(
    (delId) => `/api/ingredients/${delId}`,
    { invalidateKeys: [['ingredients']] }
  )

  const handleDelete = async () => {
    await deleteIngredient.mutateAsync(ingredientId)
    navigate('/ingredients')
  }

  const handleEditLot = (lot: IngredientLotSummary) => {
    setEditingLot(lot)
    setLotDialogOpen(true)
  }

  const handleAddLot = () => {
    setEditingLot(undefined)
    setLotDialogOpen(true)
  }

  const lotColumns: GridColDef[] = [
    { field: 'lot_number', headerName: 'Lot Number', flex: 1 },
    { field: 'supplier', headerName: 'Supplier', flex: 1 },
    {
      field: 'status',
      headerName: 'Status',
      flex: 1,
      renderCell: (params) => <StatusChip status={params.value} domain="lot" />,
    },
    { field: 'alpha_acid', headerName: 'Alpha Acid', flex: 1 },
    { field: 'color_lovibond', headerName: 'Color (L)', flex: 1 },
    { field: 'potential_gravity', headerName: 'Potential Gravity', flex: 1 },
    { field: 'attenuation', headerName: 'Attenuation', flex: 1 },
  ]

  if (!ingredient) return null

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Ingredients', to: '/ingredients' },
          { label: ingredient.name },
        ]}
        title={ingredient.name}
        toolbar={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Edit Ingredient"><IconButton onClick={() => setEditOpen(true)}><EditIcon /></IconButton></Tooltip>
            <Tooltip title="Delete Ingredient"><IconButton onClick={() => setDeleteOpen(true)} color="error"><DeleteIcon /></IconButton></Tooltip>
          </Box>
        }
      />

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Name
            </Typography>
            <Typography>{ingredient.name}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Category
            </Typography>
            <Typography>{ingredient.category?.name ?? 'None'}</Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Notes
            </Typography>
            <Typography>{ingredient.notes || 'No notes'}</Typography>
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Lots</Typography>
        <Button variant="outlined" onClick={handleAddLot}>
          Add Lot
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <DataGridExtended
          rows={ingredient.lots ?? []}
          columns={lotColumns}
          autoHeight
          disableRowSelectionOnClick
          onRowClick={(params) => handleEditLot(params.row as IngredientLotSummary)}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Paper>

      <IngredientFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        ingredient={ingredient}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Ingredient"
        message={`Are you sure you want to delete "${ingredient.name}"? This action cannot be undone.`}
        loading={deleteIngredient.isPending}
      />

      <IngredientLotDialog
        open={lotDialogOpen}
        onClose={() => {
          setLotDialogOpen(false)
          setEditingLot(undefined)
        }}
        ingredientId={ingredientId}
        lot={editingLot as any}
      />
    </>
  )
}
