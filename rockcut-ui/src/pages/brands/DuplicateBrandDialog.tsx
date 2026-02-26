import { useState, useEffect } from 'react';
import { TextField, FormControlLabel, Checkbox } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FormDialog from '../../components/FormDialog';
import api from '../../lib/api';
import parseApiError from '../../lib/parseApiError';
import type { Brand, ApiResponse } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  brand: Brand;
  onSuccess?: (newBrand: Brand) => void;
}

export default function DuplicateBrandDialog({ open, onClose, brand, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [cloneAllRecipes, setCloneAllRecipes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse<Brand>>(`/api/brands/${brand.id}/duplicate`, {
        name,
        clone_all_recipes: cloneAllRecipes,
      });
      return data.data;
    },
    onSuccess: (newBrand) => {
      qc.invalidateQueries({ queryKey: ['brands'] });
      onSuccess?.(newBrand);
      onClose();
    },
  });

  useEffect(() => {
    if (open) {
      setName(`${brand.name} (Copy)`);
      setCloneAllRecipes(false);
      setError(null);
    }
  }, [open, brand]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      await mutation.mutateAsync();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Duplicate Brand"
      onSubmit={handleSubmit}
      loading={mutation.isPending}
      error={error}
      submitLabel="Duplicate"
    >
      <TextField
        label="New Brand Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        fullWidth
        margin="normal"
      />
      <FormControlLabel
        control={<Checkbox checked={cloneAllRecipes} onChange={(e) => setCloneAllRecipes(e.target.checked)} />}
        label="Clone all recipes (otherwise only the default recipe)"
      />
    </FormDialog>
  );
}
