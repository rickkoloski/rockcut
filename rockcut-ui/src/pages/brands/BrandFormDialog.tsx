import { useState, useEffect } from 'react';
import { TextField, MenuItem } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { Brand } from '../../lib/types';

interface BrandFormDialogProps {
  open: boolean;
  onClose: () => void;
  brand?: Brand;
}

const STATUSES = ['active', 'seasonal', 'retired'];

export default function BrandFormDialog({ open, onClose, brand }: BrandFormDialogProps) {
  const [name, setName] = useState('');
  const [style, setStyle] = useState('');
  const [description, setDescription] = useState('');
  const [targetAbv, setTargetAbv] = useState<string>('');
  const [targetIbu, setTargetIbu] = useState<string>('');
  const [targetSrm, setTargetSrm] = useState<string>('');
  const [status, setStatus] = useState('active');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useApiCreate<Brand>('/api/brands', {
    invalidateKeys: [['brands']],
  });

  const updateMutation = useApiUpdate<Brand>(
    (id) => `/api/brands/${id}`,
    { invalidateKeys: [['brands'], ['brand', brand?.id]] },
  );

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? '');
      setStyle(brand?.style ?? '');
      setDescription(brand?.description ?? '');
      setTargetAbv(brand?.target_abv != null ? String(brand.target_abv) : '');
      setTargetIbu(brand?.target_ibu != null ? String(brand.target_ibu) : '');
      setTargetSrm(brand?.target_srm != null ? String(brand.target_srm) : '');
      setStatus(brand?.status ?? 'active');
      setError(null);
    }
  }, [open, brand]);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        style: style || null,
        description: description || null,
        target_abv: targetAbv ? Number(targetAbv) : null,
        target_ibu: targetIbu ? Number(targetIbu) : null,
        target_srm: targetSrm ? Number(targetSrm) : null,
        status,
      };

      if (brand) {
        await updateMutation.mutateAsync({ id: brand.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={brand ? 'Edit Brand' : 'Add Brand'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        fullWidth
        margin="normal"
      />
      <TextField
        label="Style"
        value={style}
        onChange={(e) => setStyle(e.target.value)}
        fullWidth
        margin="normal"
      />
      <TextField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        multiline
        rows={3}
        margin="normal"
      />
      <TextField
        label="Target ABV"
        value={targetAbv}
        onChange={(e) => setTargetAbv(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
        slotProps={{ htmlInput: { step: 0.1 } }}
      />
      <TextField
        label="Target IBU"
        value={targetIbu}
        onChange={(e) => setTargetIbu(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Target SRM"
        value={targetSrm}
        onChange={(e) => setTargetSrm(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
      />
      <TextField
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        select
        fullWidth
        margin="normal"
      >
        {STATUSES.map((s) => (
          <MenuItem key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
