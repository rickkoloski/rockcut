import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Paper,
  Typography,
  Grid,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import type { Batch, BatchLogEntry, BrewTurn } from '../../lib/types';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useApiDelete } from '../../hooks/useApiMutation';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import ConfirmDialog from '../../components/ConfirmDialog';
import BatchFormDialog from './BatchFormDialog';
import BrewTurnDialog from './BrewTurnDialog';
import BatchLogEntryDialog from './BatchLogEntryDialog';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Grid size={{ xs: 6, sm: 4, md: 3 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" component="div">{value ?? '—'}</Typography>
    </Grid>
  );
}

const turnColumns: GridColDef[] = [
  { field: 'turn_number', headerName: 'Turn #', width: 90 },
  {
    field: 'recipe_version',
    headerName: 'Recipe',
    flex: 1,
    valueGetter: (_value: unknown, row: BrewTurn) => row.recipe?.version ?? '',
  },
  { field: 'brew_date', headerName: 'Brew Date', width: 120 },
  { field: 'actual_og', headerName: 'OG', width: 90 },
  { field: 'actual_volume', headerName: 'Volume', width: 100 },
  { field: 'actual_efficiency', headerName: 'Efficiency', width: 110 },
];

const logColumns: GridColDef[] = [
  { field: 'timestamp', headerName: 'Timestamp', flex: 1 },
  {
    field: 'event_type',
    headerName: 'Event',
    width: 140,
    renderCell: (params) => <Chip label={params.value} size="small" />,
  },
  { field: 'gravity', headerName: 'Gravity', width: 90 },
  { field: 'temperature', headerName: 'Temp', width: 90 },
  { field: 'ph', headerName: 'pH', width: 80 },
  { field: 'notes', headerName: 'Notes', flex: 1 },
];

export default function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: batch, isLoading } = useApiQuery<Batch>(
    ['batch', Number(id)],
    `/api/batches/${id}`,
  );

  const { data: logEntries = [] } = useApiQuery<BatchLogEntry[]>(
    ['batch_log_entries', { batch_id: id }],
    '/api/batch_log_entries',
    { batch_id: id! },
  );

  const deleteMutation = useApiDelete(
    (batchId) => `/api/batches/${batchId}`,
    { invalidateKeys: [['batches']] },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [turnDialogOpen, setTurnDialogOpen] = useState(false);
  const [selectedTurn, setSelectedTurn] = useState<BrewTurn | undefined>();
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<BatchLogEntry | undefined>();

  if (isLoading || !batch) {
    return <CircularProgress />;
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(batch.id);
    navigate('/batches');
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Home', to: '/' },
          { label: 'Batches', to: '/batches' },
          { label: batch.batch_number },
        ]}
        title={batch.batch_number}
        toolbar={
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Edit Batch"><IconButton onClick={() => setEditOpen(true)}><EditIcon /></IconButton></Tooltip>
            <Tooltip title="Delete Batch"><IconButton onClick={() => setDeleteOpen(true)} color="error"><DeleteIcon /></IconButton></Tooltip>
          </Box>
        }
      />

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>General</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Field label="Brand" value={batch.brand?.name} />
          <Field label="Batch Number" value={batch.batch_number} />
          <Field label="Status" value={<StatusChip status={batch.status} domain="batch" />} />
        </Grid>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Actuals</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Field label="OG" value={batch.actual_og} />
          <Field label="FG" value={batch.actual_fg} />
          <Field label="ABV" value={batch.actual_abv} />
          <Field label="Volume" value={batch.actual_volume} />
        </Grid>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Fermentation</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Field label="Start Date" value={batch.ferm_start_date} />
          <Field label="End Date" value={batch.ferm_end_date} />
          <Field label="Temp" value={batch.ferm_temp} />
        </Grid>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Packaging</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Field label="Package Date" value={batch.package_date} />
          <Field label="Package Type" value={batch.package_type} />
        </Grid>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>Tasting</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Field label="Rating" value={batch.rating} />
          <Field label="Tasting Notes" value={batch.tasting_notes} />
        </Grid>

      </Paper>

      {/* Brew Turns */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5">Brew Turns</Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => { setSelectedTurn(undefined); setTurnDialogOpen(true); }}
        >
          Add Turn
        </Button>
      </Box>
      <Paper sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <DataGridExtended
          rows={batch.brew_turns ?? []}
          columns={turnColumns}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => {
            setSelectedTurn(params.row as BrewTurn);
            setTurnDialogOpen(true);
          }}
        />
      </Paper>

      {/* Log Entries */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5">Log Entries</Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => { setSelectedEntry(undefined); setLogDialogOpen(true); }}
        >
          Add Entry
        </Button>
      </Box>
      <Paper sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
        <DataGridExtended
          rows={logEntries}
          columns={logColumns}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => {
            setSelectedEntry(params.row as BatchLogEntry);
            setLogDialogOpen(true);
          }}
        />
      </Paper>

      {/* Dialogs */}
      <BatchFormDialog open={editOpen} onClose={() => setEditOpen(false)} batch={batch} />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Batch"
        message={`Are you sure you want to delete batch "${batch.batch_number}"? This cannot be undone.`}
        loading={deleteMutation.isPending}
      />

      <BrewTurnDialog
        open={turnDialogOpen}
        onClose={() => setTurnDialogOpen(false)}
        batchId={batch.id}
        brandId={batch.brand_id}
        turn={selectedTurn}
      />

      <BatchLogEntryDialog
        open={logDialogOpen}
        onClose={() => setLogDialogOpen(false)}
        batchId={batch.id}
        entry={selectedEntry}
      />
    </>
  );
}
