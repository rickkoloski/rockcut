import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Paper,
  Typography,
  Grid,
  Box,
  Button,
  IconButton,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { IngredientCategory, CategoryFieldDefinition } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiDelete } from '../../hooks/useApiMutation';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import CategoryFormDialog from './CategoryFormDialog';
import FieldDefinitionDialog from './FieldDefinitionDialog';

export default function CategoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: category, isLoading } = useApiQuery<IngredientCategory>(
    ['ingredient_category', Number(id)],
    `/api/ingredient_categories/${id}`,
  );

  const deleteCategoryMutation = useApiDelete(
    (catId) => `/api/ingredient_categories/${catId}`,
    { invalidateKeys: [['ingredient_categories']] },
  );

  const deleteFieldMutation = useApiDelete(
    (defId) => `/api/category_field_definitions/${defId}`,
    { invalidateKeys: [['ingredient_category', Number(id)]] },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CategoryFieldDefinition | undefined>();
  const [deleteFieldOpen, setDeleteFieldOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<CategoryFieldDefinition | undefined>();

  if (isLoading || !category) {
    return <CircularProgress />;
  }

  const handleDeleteCategory = async () => {
    await deleteCategoryMutation.mutateAsync(category.id);
    navigate('/settings');
  };

  const handleDeleteField = async () => {
    if (fieldToDelete) {
      await deleteFieldMutation.mutateAsync(fieldToDelete.id);
      setDeleteFieldOpen(false);
      setFieldToDelete(undefined);
    }
  };

  const fieldColumns: GridColDef[] = [
    { field: 'field_name', headerName: 'Field Name', flex: 1 },
    { field: 'field_type', headerName: 'Type', width: 120 },
    { field: 'options', headerName: 'Options', flex: 1 },
    {
      field: 'required',
      headerName: 'Required',
      width: 100,
      renderCell: (params) => (params.value ? 'Yes' : 'No'),
    },
    { field: 'sort_order', headerName: 'Sort', width: 100 },
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setFieldToDelete(params.row as CategoryFieldDefinition);
            setDeleteFieldOpen(true);
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Settings', to: '/settings' },
          { label: category.name },
        ]}
        title={category.name}
        toolbar={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Edit Category"><IconButton onClick={() => setEditOpen(true)}><EditIcon /></IconButton></Tooltip>
            <Tooltip title="Delete Category"><IconButton onClick={() => setDeleteOpen(true)} color="error"><DeleteIcon /></IconButton></Tooltip>
          </Box>
        }
      />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="caption" color="text.secondary">Name</Typography>
            <Typography variant="body2">{category.name}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="caption" color="text.secondary">Sort Order</Typography>
            <Typography variant="body2">{category.sort_order ?? '—'}</Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Field Definitions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5">Field Definitions</Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => { setSelectedField(undefined); setFieldDialogOpen(true); }}
        >
          Add Field
        </Button>
      </Box>
      <Paper sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <DataGridExtended
          rows={category.field_definitions ?? []}
          columns={fieldColumns}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => {
            setSelectedField(params.row as CategoryFieldDefinition);
            setFieldDialogOpen(true);
          }}
        />
      </Paper>

      {/* Dialogs */}
      <CategoryFormDialog open={editOpen} onClose={() => setEditOpen(false)} category={category} />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDeleteCategory}
        title="Delete Category"
        message={`Are you sure you want to delete "${category.name}"? This will also delete all field definitions. This cannot be undone.`}
        loading={deleteCategoryMutation.isPending}
      />

      <FieldDefinitionDialog
        open={fieldDialogOpen}
        onClose={() => setFieldDialogOpen(false)}
        categoryId={category.id}
        definition={selectedField}
      />

      <ConfirmDialog
        open={deleteFieldOpen}
        onClose={() => { setDeleteFieldOpen(false); setFieldToDelete(undefined); }}
        onConfirm={handleDeleteField}
        title="Delete Field Definition"
        message={`Are you sure you want to delete "${fieldToDelete?.field_name}"? This cannot be undone.`}
        loading={deleteFieldMutation.isPending}
      />
    </>
  );
}
