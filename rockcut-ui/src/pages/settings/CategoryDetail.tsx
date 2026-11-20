import { useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Paper,
  Typography,
  Grid,
  Box,
  Button,
  IconButton,
  CircularProgress,
  Tooltip,
  Alert,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { IngredientCategory, CategoryFieldDefinition } from '../../lib/types';
import { useApiList, useApiQuery } from '../../hooks/useApiQuery';
import { useApiDelete } from '../../hooks/useApiMutation';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import CategoryFormDialog from './CategoryFormDialog';
import FieldDefinitionDialog from './FieldDefinitionDialog';
import parseApiError from '../../lib/parseApiError';
import ItemNotFound from '../../components/ItemNotFound';
import { httpStatus, retryUnless404 } from '../../lib/notFound';
import { isGrainCategory, isManagedCategory } from '../../lib/ingredientFeatures';

export default function CategoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: category, isLoading, error } = useApiQuery<IngredientCategory>(
    ['ingredient_category', Number(id)],
    `/api/ingredient_categories/${id}`,
    undefined,
    { retry: retryUnless404 },
  );

  // D60 §3.1: a top-level category's children (Grains → Base, …), and a child's parent.
  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories');
  const children = categories.filter((c) => c.parent_id === Number(id)).sort((a, b) => a.sort_order - b.sort_order);
  const grains = isGrainCategory(categories, Number(id));
  // D62 §3.1: Hops (like Grains) has features on its products and lots, no custom fields.
  const managed = isManagedCategory(categories, Number(id));
  const [childOpen, setChildOpen] = useState(false);

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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CategoryFieldDefinition | undefined>();
  const [deleteFieldOpen, setDeleteFieldOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<CategoryFieldDefinition | undefined>();

  // D55 §2.6 (task 4993): a category that doesn't exist (or an old link) says so
  // instead of spinning.
  if (!category && httpStatus(error) === 404) {
    return (
      <ItemNotFound
        what="Category"
        backTo="/ingredients/categories"
        backLabel="Back to Ingredient categories"
        testId="category-not-found"
      />
    );
  }

  if (!category && error) {
    return <Alert severity="error">{parseApiError(error)}</Alert>;
  }

  if (isLoading || !category) {
    return <CircularProgress />;
  }

  // D60 gap 12: a category with grains or sub-categories is refused (422); the
  // confirm stays open and says why.
  const handleDeleteCategory = async () => {
    try {
      await deleteCategoryMutation.mutateAsync(category.id);
      navigate('/ingredients/categories');
    } catch (err) {
      setDeleteError(parseApiError(err));
    }
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
          { label: 'Ingredient Library', to: '/ingredients' },
          { label: 'Categories', to: '/ingredients/categories' },
          { label: category.name },
        ]}
        title={category.name}
        toolbar={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Edit Category"><IconButton onClick={() => setEditOpen(true)}><EditIcon /></IconButton></Tooltip>
            {/* D61 carry-over 2: disabled with the API's reason while it has grains, ingredients or sub-categories. */}
            <Tooltip title="Delete Category">
              <span>
                <IconButton onClick={() => setDeleteOpen(true)} color="error" disabled={!!category.delete_blocked} data-testid="category-delete">
                  <DeleteIcon />
                </IconButton>
              </span>
            </Tooltip>
            {category.delete_blocked && (
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', maxWidth: 260 }} data-testid="category-delete-reason">
                {category.delete_blocked}
              </Typography>
            )}
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
          {category.parent_id != null && (
            <Grid size={{ xs: 6, sm: 4 }}>
              <Typography variant="caption" color="text.secondary">Parent</Typography>
              <Typography variant="body2">
                <RouterLink to={`/ingredients/categories/${category.parent_id}`}>
                  {categories.find((c) => c.id === category.parent_id)?.name ?? '—'}
                </RouterLink>
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* D60 §3.1: subcategories (one level). */}
      {category.parent_id == null && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h5">Subcategories</Typography>
            <Button variant="outlined" size="small" onClick={() => setChildOpen(true)} data-testid="category-add-child">
              Add Subcategory
            </Button>
          </Box>
          <Paper sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }} data-testid="category-children">
            {children.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                No subcategories
              </Typography>
            ) : (
              <List disablePadding>
                {children.map((c) => (
                  <ListItemButton key={c.id} divider onClick={() => navigate(`/ingredients/categories/${c.id}`)}>
                    <ListItemText primary={c.name} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </>
      )}

      {/* Field Definitions. D61 carry-over 5: none on Grains and its children (grains have features; the API refuses). */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5">Field Definitions</Typography>
        {managed ? (
          <Typography variant="body2" color="text.secondary" data-testid="category-grain-fields-note">
            {grains ? 'Grains' : category.name} use specs (features), not custom fields
          </Typography>
        ) : (
          <Button
            variant="outlined"
            size="small"
            onClick={() => { setSelectedField(undefined); setFieldDialogOpen(true); }}
            data-testid="category-add-field"
          >
            Add Field
          </Button>
        )}
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
      <CategoryFormDialog open={childOpen} onClose={() => setChildOpen(false)} parentId={category.id} />

      <ConfirmDialog
        open={deleteOpen && !category.delete_blocked}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteCategory}
        title="Delete Category"
        message={`Are you sure you want to delete "${category.name}"? This will also delete all field definitions. This cannot be undone.`}
        loading={deleteCategoryMutation.isPending}
        testId="category-delete-confirm"
      >
        {deleteError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {deleteError}
          </Alert>
        )}
      </ConfirmDialog>

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
