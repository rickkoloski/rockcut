import { useState } from 'react';
import { Box, Button, IconButton, Paper } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { useApiDelete } from '../../../hooks/useApiMutation';
import RecipeIngredientDialog from '../RecipeIngredientDialog';
import type { Recipe, RecipeIngredient } from '../../../lib/types';

interface GrainBillTabProps {
  recipe: Recipe;
}

export default function GrainBillTab({ recipe }: GrainBillTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<RecipeIngredient | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const deleteMutation = useApiDelete(
    (id) => `/api/recipe_ingredients/${id}`,
    { invalidateKeys: [['recipe', recipe.id]] },
  );

  const ingredients: RecipeIngredient[] = recipe.recipe_ingredients ?? [];

  const columns: GridColDef<RecipeIngredient>[] = [
    {
      field: 'ingredient_name',
      headerName: 'Ingredient',
      flex: 1,
      valueGetter: (_value, row) => row.lot?.ingredient?.name ?? '—',
    },
    {
      field: 'category',
      headerName: 'Category',
      flex: 1,
      valueGetter: (_value, row) => row.lot?.ingredient?.category?.name ?? '—',
    },
    {
      field: 'lot_number',
      headerName: 'Lot #',
      width: 120,
      valueGetter: (_value, row) => row.lot?.lot_number ?? '—',
    },
    { field: 'amount', headerName: 'Amount', width: 100 },
    { field: 'unit', headerName: 'Unit', width: 100 },
    { field: 'use', headerName: 'Use', width: 120 },
    { field: 'time_minutes', headerName: 'Time (min)', width: 110 },
    { field: 'sort_order', headerName: 'Order', width: 80 },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setEditItem(params.row);
              setDialogOpen(true);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(params.row.id);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </>
      ),
    },
  ];

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditItem(undefined);
  };

  const handleDelete = async () => {
    if (deleteId != null) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          Add Ingredient
        </Button>
      </Box>

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={ingredients}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
        />
      </Paper>

      <RecipeIngredientDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        recipeId={recipe.id}
        ingredient={editItem}
      />
      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Ingredient"
        message="Are you sure you want to remove this ingredient from the recipe?"
        loading={deleteMutation.isPending}
      />
    </>
  );
}
