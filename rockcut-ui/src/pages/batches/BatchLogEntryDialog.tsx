import { useEffect, useState } from 'react';
import {
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import type { BatchLogEntry } from '../../lib/types';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import FormDialog from '../../components/FormDialog';
import parseApiError from '../../lib/parseApiError';

interface BatchLogEntryDialogProps {
  open: boolean;
  onClose: () => void;
  batchId: number;
  entry?: BatchLogEntry;
}

export default function BatchLogEntryDialog({ open, onClose, batchId, entry }: BatchLogEntryDialogProps) {
  const [timestamp, setTimestamp] = useState('');
  const [eventType, setEventType] = useState('note');
  const [gravity, setGravity] = useState('');
  const [temperature, setTemperature] = useState('');
  const [ph, setPh] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setTimestamp(entry?.timestamp ?? '');
      setEventType(entry?.event_type ?? 'note');
      setGravity(entry?.gravity?.toString() ?? '');
      setTemperature(entry?.temperature?.toString() ?? '');
      setPh(entry?.ph?.toString() ?? '');
      setNotes(entry?.notes ?? '');
    }
  }, [open, entry]);

  const createMutation = useApiCreate<BatchLogEntry>('/api/batch_log_entries', {
    invalidateKeys: [['batch_log_entries', { batch_id: batchId }]],
  });

  const updateMutation = useApiUpdate<BatchLogEntry>(
    (id) => `/api/batch_log_entries/${id}`,
    { invalidateKeys: [['batch_log_entries', { batch_id: batchId }]] },
  );

  const loading = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        batch_id: batchId,
        timestamp: timestamp || null,
        event_type: eventType,
        gravity: gravity ? Number(gravity) : null,
        temperature: temperature ? Number(temperature) : null,
        ph: ph ? Number(ph) : null,
        notes: notes || null,
      };

      if (entry) {
        await updateMutation.mutateAsync({ id: entry.id, ...payload });
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
      title={entry ? 'Edit Log Entry' : 'New Log Entry'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField
        fullWidth
        margin="dense"
        label="Timestamp"
        type="datetime-local"
        value={timestamp}
        onChange={(e) => setTimestamp(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <FormControl fullWidth margin="dense">
        <InputLabel>Event Type</InputLabel>
        <Select value={eventType} label="Event Type" onChange={(e) => setEventType(e.target.value)}>
          <MenuItem value="gravity_reading">Gravity Reading</MenuItem>
          <MenuItem value="temp_reading">Temp Reading</MenuItem>
          <MenuItem value="dry_hop">Dry Hop</MenuItem>
          <MenuItem value="transfer">Transfer</MenuItem>
          <MenuItem value="note">Note</MenuItem>
          <MenuItem value="ph_reading">pH Reading</MenuItem>
          <MenuItem value="other">Other</MenuItem>
        </Select>
      </FormControl>
      <TextField
        fullWidth
        margin="dense"
        label="Gravity"
        type="number"
        value={gravity}
        onChange={(e) => setGravity(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Temperature"
        type="number"
        value={temperature}
        onChange={(e) => setTemperature(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="pH"
        type="number"
        value={ph}
        onChange={(e) => setPh(e.target.value)}
      />
      <TextField
        fullWidth
        margin="dense"
        label="Notes"
        multiline
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
    </FormDialog>
  );
}
