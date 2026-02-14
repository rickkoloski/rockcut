import { useEffect, useState } from 'react';
import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Box,
} from '@mui/material';
import type { Batch, Brand } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import FormDialog from '../../components/FormDialog';
import parseApiError from '../../lib/parseApiError';

interface BatchFormDialogProps {
  open: boolean;
  onClose: () => void;
  batch?: Batch;
}

export default function BatchFormDialog({ open, onClose, batch }: BatchFormDialogProps) {
  const { data: brands = [] } = useApiQuery<Brand[]>(['brands'], '/api/brands');

  const [brandId, setBrandId] = useState<number | ''>('');
  const [batchNumber, setBatchNumber] = useState('');
  const [status, setStatus] = useState('planned');
  const [actualOg, setActualOg] = useState('');
  const [actualFg, setActualFg] = useState('');
  const [actualAbv, setActualAbv] = useState('');
  const [actualVolume, setActualVolume] = useState('');
  const [fermStartDate, setFermStartDate] = useState('');
  const [fermEndDate, setFermEndDate] = useState('');
  const [fermTemp, setFermTemp] = useState('');
  const [packageDate, setPackageDate] = useState('');
  const [packageType, setPackageType] = useState('');
  const [rating, setRating] = useState('');
  const [tastingNotes, setTastingNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setBrandId(batch?.brand_id ?? '');
      setBatchNumber(batch?.batch_number ?? '');
      setStatus(batch?.status ?? 'planned');
      setActualOg(batch?.actual_og?.toString() ?? '');
      setActualFg(batch?.actual_fg?.toString() ?? '');
      setActualAbv(batch?.actual_abv?.toString() ?? '');
      setActualVolume(batch?.actual_volume?.toString() ?? '');
      setFermStartDate(batch?.ferm_start_date ?? '');
      setFermEndDate(batch?.ferm_end_date ?? '');
      setFermTemp(batch?.ferm_temp?.toString() ?? '');
      setPackageDate(batch?.package_date ?? '');
      setPackageType(batch?.package_type ?? '');
      setRating(batch?.rating?.toString() ?? '');
      setTastingNotes(batch?.tasting_notes ?? '');
      setNotes(batch?.notes ?? '');
    }
  }, [open, batch]);

  const createMutation = useApiCreate<Batch>('/api/batches', {
    invalidateKeys: [['batches']],
  });

  const updateMutation = useApiUpdate<Batch>(
    (id) => `/api/batches/${id}`,
    { invalidateKeys: [['batches'], ['batch', batch?.id]] },
  );

  const loading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        brand_id: brandId || null,
        batch_number: batchNumber,
        status,
        actual_og: actualOg ? Number(actualOg) : null,
        actual_fg: actualFg ? Number(actualFg) : null,
        actual_abv: actualAbv ? Number(actualAbv) : null,
        actual_volume: actualVolume ? Number(actualVolume) : null,
        ferm_start_date: fermStartDate || null,
        ferm_end_date: fermEndDate || null,
        ferm_temp: fermTemp ? Number(fermTemp) : null,
        package_date: packageDate || null,
        package_type: packageType || null,
        rating: rating ? Number(rating) : null,
        tasting_notes: tastingNotes || null,
        notes: notes || null,
      };

      if (batch) {
        await updateMutation.mutateAsync({ id: batch.id, ...payload });
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
      title={batch ? 'Edit Batch' : 'New Batch'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>General</Typography>
      <FormControl fullWidth margin="dense">
        <InputLabel>Brand</InputLabel>
        <Select
          value={brandId}
          label="Brand"
          onChange={(e) => setBrandId(e.target.value as number)}
        >
          {brands.map((b) => (
            <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        fullWidth
        margin="dense"
        label="Batch Number"
        required
        value={batchNumber}
        onChange={(e) => setBatchNumber(e.target.value)}
      />
      <FormControl fullWidth margin="dense">
        <InputLabel>Status</InputLabel>
        <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
          <MenuItem value="planned">Planned</MenuItem>
          <MenuItem value="brewing">Brewing</MenuItem>
          <MenuItem value="fermenting">Fermenting</MenuItem>
          <MenuItem value="conditioning">Conditioning</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="dumped">Dumped</MenuItem>
        </Select>
      </FormControl>

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Actuals</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          margin="dense"
          label="Actual OG"
          type="number"
          value={actualOg}
          onChange={(e) => setActualOg(e.target.value)}
        />
        <TextField
          fullWidth
          margin="dense"
          label="Actual FG"
          type="number"
          value={actualFg}
          onChange={(e) => setActualFg(e.target.value)}
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          margin="dense"
          label="Actual ABV"
          type="number"
          value={actualAbv}
          onChange={(e) => setActualAbv(e.target.value)}
        />
        <TextField
          fullWidth
          margin="dense"
          label="Actual Volume"
          type="number"
          value={actualVolume}
          onChange={(e) => setActualVolume(e.target.value)}
        />
      </Box>

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Fermentation</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          margin="dense"
          label="Ferm Start Date"
          type="date"
          value={fermStartDate}
          onChange={(e) => setFermStartDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          fullWidth
          margin="dense"
          label="Ferm End Date"
          type="date"
          value={fermEndDate}
          onChange={(e) => setFermEndDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Box>
      <TextField
        fullWidth
        margin="dense"
        label="Ferm Temp"
        type="number"
        value={fermTemp}
        onChange={(e) => setFermTemp(e.target.value)}
      />

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Packaging</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          margin="dense"
          label="Package Date"
          type="date"
          value={packageDate}
          onChange={(e) => setPackageDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControl fullWidth margin="dense">
          <InputLabel>Package Type</InputLabel>
          <Select
            value={packageType}
            label="Package Type"
            onChange={(e) => setPackageType(e.target.value)}
          >
            <MenuItem value=""><em>None</em></MenuItem>
            <MenuItem value="keg">Keg</MenuItem>
            <MenuItem value="bottle">Bottle</MenuItem>
            <MenuItem value="can">Can</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Tasting</Typography>
      <TextField
        fullWidth
        margin="dense"
        label="Rating (1-5)"
        type="number"
        value={rating}
        onChange={(e) => setRating(e.target.value)}
        slotProps={{ htmlInput: { min: 1, max: 5 } }}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Tasting Notes"
        multiline
        rows={2}
        value={tastingNotes}
        onChange={(e) => setTastingNotes(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Notes"
        multiline
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </FormDialog>
  );
}
