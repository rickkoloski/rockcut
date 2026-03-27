import { useState, useEffect } from 'react';
import { TextField, MenuItem } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import { useApiQuery } from '../../hooks/useApiQuery';
import parseApiError from '../../lib/parseApiError';
import type { Brand, Brewhouse, ProcessProfile } from '../../lib/types';

interface BrandFormDialogProps {
  open: boolean;
  onClose: () => void;
  brand?: Brand;
}

const STATUSES = ['active', 'seasonal', 'retired', 'archived'];

export default function BrandFormDialog({ open, onClose, brand }: BrandFormDialogProps) {
  const [name, setName] = useState('');
  const [style, setStyle] = useState('');
  const [description, setDescription] = useState('');
  const [targetAbv, setTargetAbv] = useState<string>('');
  const [targetIbu, setTargetIbu] = useState<string>('');
  const [targetSrm, setTargetSrm] = useState<string>('');
  const [apparentAttenuation, setApparentAttenuation] = useState<string>('');
  const [targetMashEfficiency, setTargetMashEfficiency] = useState<string>('');
  const [targetBatchSize, setTargetBatchSize] = useState<string>('');
  const [originalGravity, setOriginalGravity] = useState<string>('');
  const [status, setStatus] = useState('active');
  const [brewhouseId, setBrewhouseId] = useState<number | ''>('');
  const [processProfileId, setProcessProfileId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const { data: brewhouses = [] } = useApiQuery<Brewhouse[]>(['brewhouses'], '/api/brewhouses');
  const { data: processProfiles = [] } = useApiQuery<ProcessProfile[]>(['process_profiles'], '/api/process_profiles');

  // Resolve brewhouse for dynamic label (e.g., "Target Batch Size (bbl)")
  const selectedBrewhouse = brewhouseId
    ? brewhouses.find((b) => b.id === brewhouseId) ?? null
    : brand?.resolved_brewhouse
      ? brewhouses.find((b) => b.id === brand.resolved_brewhouse!.id) ?? null
      : null;

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
      setApparentAttenuation(brand?.apparent_attenuation != null ? String(brand.apparent_attenuation) : '');
      setTargetMashEfficiency(brand?.target_mash_efficiency != null ? String(brand.target_mash_efficiency) : '');
      setTargetBatchSize(brand?.target_batch_size != null ? String(brand.target_batch_size) : '');
      setOriginalGravity(brand?.original_gravity != null ? String(brand.original_gravity) : '');
      setStatus(brand?.status ?? 'active');
      setBrewhouseId(brand?.brewhouse_id ?? '');
      setProcessProfileId(brand?.process_profile_id ?? '');
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
        apparent_attenuation: apparentAttenuation ? Number(apparentAttenuation) : null,
        target_mash_efficiency: targetMashEfficiency ? Number(targetMashEfficiency) : null,
        target_batch_size: targetBatchSize ? Number(targetBatchSize) : null,
        original_gravity: originalGravity ? Number(originalGravity) : null,
        status,
        brewhouse_id: brewhouseId || null,
        process_profile_id: processProfileId || null,
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
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth margin="normal" />
      <TextField label="Style" value={style} onChange={(e) => setStyle(e.target.value)} fullWidth margin="normal" />
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={3} margin="normal" />
      <TextField label="Target ABV" value={targetAbv} onChange={(e) => setTargetAbv(e.target.value)} type="number" fullWidth margin="normal" slotProps={{ htmlInput: { step: 0.1 } }} />
      <TextField label="Target IBU" value={targetIbu} onChange={(e) => setTargetIbu(e.target.value)} type="number" fullWidth margin="normal" />
      <TextField label="Target SRM" value={targetSrm} onChange={(e) => setTargetSrm(e.target.value)} type="number" fullWidth margin="normal" />
      <TextField label="Apparent Attenuation (%)" value={apparentAttenuation} onChange={(e) => setApparentAttenuation(e.target.value)} type="number" fullWidth margin="normal" helperText="Typical range: 65-85%" slotProps={{ htmlInput: { step: 0.01 } }} />
      <TextField label="Target Mash Efficiency (%)" value={targetMashEfficiency} onChange={(e) => setTargetMashEfficiency(e.target.value)} type="number" fullWidth margin="normal" helperText="Typical range: 70-85%" slotProps={{ htmlInput: { step: 0.01 } }} />
      <TextField
        label={`Target Batch Size${selectedBrewhouse ? ` (${selectedBrewhouse.liquid_vol_unit})` : ''}`}
        value={targetBatchSize}
        onChange={(e) => setTargetBatchSize(e.target.value)}
        type="number"
        fullWidth
        margin="normal"
        slotProps={{ htmlInput: { step: 0.1 } }}
      />
      <TextField label="Original Gravity" value={originalGravity} onChange={(e) => setOriginalGravity(e.target.value)} type="number" fullWidth margin="normal" helperText="e.g., 1.048" slotProps={{ htmlInput: { step: 0.001 } }} />
      <TextField label="Status" value={status} onChange={(e) => setStatus(e.target.value)} select fullWidth margin="normal">
        {STATUSES.map((s) => (
          <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
        ))}
      </TextField>
      <TextField label="Brewhouse" value={brewhouseId} onChange={(e) => setBrewhouseId(e.target.value as number | '')} select fullWidth margin="normal">
        <MenuItem value="">None</MenuItem>
        {brewhouses.map((b) => (
          <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
        ))}
      </TextField>
      <TextField label="Process Profile" value={processProfileId} onChange={(e) => setProcessProfileId(e.target.value as number | '')} select fullWidth margin="normal">
        <MenuItem value="">None</MenuItem>
        {processProfiles.map((p) => (
          <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
        ))}
      </TextField>
    </FormDialog>
  );
}
