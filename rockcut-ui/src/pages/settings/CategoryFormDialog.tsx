import { useEffect, useState } from 'react';
import { TextField } from '@mui/material';
import type { IngredientCategory } from '../../lib/types';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import FormDialog from '../../components/FormDialog';
import parseApiError from '../../lib/parseApiError';

interface CategoryFormDialogProps {
  open: boolean;
  onClose: () => void;
  category?: IngredientCategory;
}

export default function CategoryFormDialog({ open, onClose, category }: CategoryFormDialogProps) {
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setName(category?.name ?? '');
      setSortOrder(category?.sort_order?.toString() ?? '');
    }
  }, [open, category]);

  const createMutation = useApiCreate<IngredientCategory>('/api/ingredient_categories', {
    invalidateKeys: [['ingredient_categories']],
  });

  const updateMutation = useApiUpdate<IngredientCategory>(
    (id) => `/api/ingredient_categories/${id}`,
    { invalidateKeys: [['ingredient_categories'], ['ingredient_category', category?.id]] },
  );

  const loading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        sort_order: sortOrder ? Number(sortOrder) : null,
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
      open={open}
      onClose={onClose}
      title={category ? 'Edit Category' : 'New Category'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        fullWidth
        margin="dense"
        label="Name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Sort Order"
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
      />
    </FormDialog>
  );
}
