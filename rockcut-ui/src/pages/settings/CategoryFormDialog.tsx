import { useState } from 'react';
import { FormControl, FormHelperText, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import type { IngredientCategory } from '../../lib/types';
import { useApiList } from '../../hooks/useApiQuery';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import FormDialog from '../../components/FormDialog';
import DecimalInput from '../../components/DecimalInput';
import parseApiError from '../../lib/parseApiError';

interface CategoryFormDialogProps {
  open: boolean;
  onClose: () => void;
  category?: IngredientCategory;
  /** D60 §3.1: a new subcategory of this parent (Grains → Base, …). */
  parentId?: number;
}

export default function CategoryFormDialog(props: CategoryFormDialogProps) {
  return props.open ? <CategoryForm {...props} /> : null;
}

function CategoryForm({ onClose, category, parentId }: CategoryFormDialogProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(category?.sort_order?.toString() ?? '');
  const [parent, setParent] = useState<number | ''>(category?.parent_id ?? parentId ?? '');
  const [error, setError] = useState<string | null>(null);

  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories');
  // One level (D60 §3.1): a parent is a top-level category, and a category with children stays top-level.
  const parents = categories.filter((c) => c.parent_id == null && c.id !== category?.id).sort((a, b) => a.sort_order - b.sort_order);
  const hasChildren = !!category && categories.some((c) => c.parent_id === category.id);

  const createMutation = useApiCreate<IngredientCategory>('/api/ingredient_categories', {
    invalidateKeys: [['ingredient_categories'], ['ingredient_category']],
  });

  const updateMutation = useApiUpdate<IngredientCategory>(
    (id) => `/api/ingredient_categories/${id}`,
    { invalidateKeys: [['ingredient_categories'], ['ingredient_category']] },
  );

  const loading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        sort_order: sortOrder.trim() ? Number(sortOrder.replace(',', '.')) : null,
        parent_id: parent || null,
      };

      if (category) {
        await updateMutation.mutateAsync({ id: category.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={category ? 'Edit Category' : parentId ? 'New Subcategory' : 'New Category'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      testId="category-dialog"
    >
      <TextField
        fullWidth
        label="Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        slotProps={{ htmlInput: { 'data-testid': 'category-name' } }}
      />
      <FormControl fullWidth disabled={hasChildren}>
        <InputLabel id="category-parent-label">Parent</InputLabel>
        <Select
          labelId="category-parent-label"
          id="category-parent"
          label="Parent"
          value={categories.length ? parent : ''}
          onChange={(e) => setParent(e.target.value as number | '')}
          data-testid="category-parent"
        >
          <MenuItem value="">
            <em>None (top level)</em>
          </MenuItem>
          {parents.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </Select>
        {hasChildren && <FormHelperText>It has subcategories, so it stays top level</FormHelperText>}
      </FormControl>
      <DecimalInput
        fullWidth
        label="Sort Order"
        value={sortOrder}
        onChange={setSortOrder}
      />
    </FormDialog>
  );
}
