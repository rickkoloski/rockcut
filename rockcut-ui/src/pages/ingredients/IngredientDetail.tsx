import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Paper, Typography, Grid, Box, Button, IconButton, Tooltip, Alert, CircularProgress, List, ListItemButton, ListItemText } from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import type { GridColDef } from '@mui/x-data-grid'
import { DataGridExtended } from 'datagrid-extended'
import type { FeatureType, Ingredient, IngredientCategory, IngredientLotSummary, IngredientProduct } from '../../lib/types'
import { useApiList, useApiQuery } from '../../hooks/useApiQuery'
import { useQuantityDisplay } from '../../hooks/useQuantityDisplay'
import { formatFeature } from '../../lib/brewingUnits'
import { grainCategories, onHandText, typesFor } from '../../lib/ingredientFeatures'
import ProductDialog from './ProductDialog'
import { useApiDelete } from '../../hooks/useApiMutation'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import ConfirmDialog from '../../components/ConfirmDialog'
import IngredientFormDialog from './IngredientFormDialog'
import IngredientLotDialog from './IngredientLotDialog'
import ItemNotFound from '../../components/ItemNotFound'
import { httpStatus, retryUnless404 } from '../../lib/notFound'
import parseApiError from '../../lib/parseApiError'

export default function IngredientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [lotDialogOpen, setLotDialogOpen] = useState(false)
  const [editingLot, setEditingLot] = useState<IngredientLotSummary | undefined>()
  const [productOpen, setProductOpen] = useState(false)
  const { mode } = useQuantityDisplay()

  const ingredientId = Number(id)

  const { data: ingredient, error } = useApiQuery<Ingredient>(
    ['ingredient', ingredientId],
    `/api/ingredients/${id}`,
    undefined,
    { retry: retryUnless404 }
  )

  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const { data: types = [] } = useApiList<FeatureType>(['feature_types'], '/api/feature_types')
  // D60: a grain (in a child of Grains) has maltster products; its lots belong to them.
  const { grains: grainsCategory } = grainCategories(categories)
  const category = categories.find((c) => c.id === ingredient?.category_id)
  const isGrain = !!grainsCategory && (category?.id === grainsCategory.id || category?.parent_id === grainsCategory.id)
  const { data: products = [] } = useApiList<IngredientProduct>(
    ['ingredient_products', { ingredient_id: ingredientId }],
    '/api/ingredient_products',
    { ingredient_id: ingredientId },
    { enabled: isGrain },
  )
  const lotTypes = typesFor(types, category?.id, category?.parent_id)

  const deleteIngredient = useApiDelete(
    (delId) => `/api/ingredients/${delId}`,
    { invalidateKeys: [['ingredients']] }
  )
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    try {
      await deleteIngredient.mutateAsync(ingredientId)
      navigate('/ingredients')
    } catch (err) {
      setDeleteOpen(false)
      setDeleteError(parseApiError(err))
    }
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
    { field: 'received_date', headerName: 'Received', flex: 1 },
    {
      field: 'status',
      headerName: 'Status',
      flex: 1,
      renderCell: (params) => <StatusChip status={params.value} domain="lot" />,
    },
    // D60: the specs are feature values (alpha acid for hops, attenuation for yeast).
    ...lotTypes.map((t): GridColDef => ({
      field: `feature_${t.key}`,
      headerName: `${t.label} (${t.unit_label})`,
      flex: 1,
      valueGetter: (_value, row: IngredientLotSummary) => formatFeature(row.features?.[t.key]?.value, t.decimals),
    })),
  ]

  // D55 lead decisions 6 (gap 10): an ingredient that doesn't exist says so.
  if (!ingredient && httpStatus(error) === 404) {
    return (
      <ItemNotFound
        what="Ingredient"
        backTo="/ingredients"
        backLabel="Back to Ingredients"
        testId="ingredient-not-found"
      />
    )
  }

  if (!ingredient && error) return <Alert severity="error">{parseApiError(error)}</Alert>

  if (!ingredient) return <CircularProgress />

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

      {deleteError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDeleteError(null)}>{deleteError}</Alert>}

      {isGrain ? (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Maltster products</Typography>
            <Button variant="outlined" onClick={() => setProductOpen(true)} data-testid="grain-add-product">
              Add maltster product
            </Button>
          </Box>
          <Paper variant="outlined" sx={{ mb: 3 }}>
            {products.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No maltster products yet. Lots are added on a maltster product.
              </Typography>
            ) : (
              <List disablePadding>
                {products.map((p) => (
                  <ListItemButton key={p.id} divider onClick={() => navigate(`/ingredients/products/${p.id}`)}>
                    <ListItemText primary={p.display_name} secondary={`On hand: ${onHandText(p, mode)}`} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </>
      ) : (
      <>
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
          columnVisibilityToggle={{ storageKey: 'rockcut:ingredient:lots' }}
          autoHeight
          disableRowSelectionOnClick
          onRowClick={(params) => handleEditLot(params.row as IngredientLotSummary)}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Paper>
      </>
      )}

      <IngredientFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        ingredient={ingredient}
      />

      <ProductDialog open={productOpen} onClose={() => setProductOpen(false)} ingredientId={ingredientId} />

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
        categoryId={ingredient.category_id}
        lot={editingLot}
      />
    </>
  )
}
