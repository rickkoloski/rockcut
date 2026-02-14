import { useState } from 'react';
import { Box, Button, IconButton, Paper } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { useApiDelete } from '../../../hooks/useApiMutation';
import MashStepDialog from '../MashStepDialog';
import type { Recipe, MashStep } from '../../../lib/types';

interface MashTabProps {
  recipe: Recipe;
}

export default function MashTab({ recipe }: MashTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<MashStep | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const deleteMutation = useApiDelete(
    (id) => `/api/mash_steps/${id}`,
    { invalidateKeys: [['recipe', recipe.id]] },
  );

  const steps: MashStep[] = recipe.mash_steps ?? [];

  const columns: GridColDef<MashStep>[] = [
    { field: 'step_number', headerName: '#', width: 60 },
    { field: 'name', headerName: 'Name', flex: 1 },
    {
      field: 'temperature',
      headerName: 'Temp',
      width: 100,
      valueFormatter: (value) => (value != null ? `${value}\u00B0F` : '—'),
    },
    {
      field: 'duration',
      headerName: 'Duration',
      width: 110,
      valueFormatter: (value) => (value != null ? `${value} min` : '—'),
    },
    { field: 'type', headerName: 'Type', width: 120 },
    { field: 'notes', headerName: 'Notes', flex: 1 },
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
          Add Step
        </Button>
      </Box>

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={steps}
          columns={columns}
          autoHeight
          disableRowSelectionOnClick
        />
      </Paper>

      <MashStepDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        recipeId={recipe.id}
        step={editItem}
      />
      <ConfirmDialog
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Mash Step"
        message="Are you sure you want to delete this mash step?"
        loading={deleteMutation.isPending}
      />
    </>
  );
}
