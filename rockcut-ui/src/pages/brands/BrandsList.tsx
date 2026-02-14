import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paper } from '@mui/material';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import { useApiQuery } from '../../hooks/useApiQuery';
import BrandFormDialog from './BrandFormDialog';
import type { Brand } from '../../lib/types';

const columns: GridColDef<Brand>[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'style', headerName: 'Style', flex: 1 },
  { field: 'target_abv', headerName: 'ABV', width: 100 },
  { field: 'target_ibu', headerName: 'IBU', width: 100 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: (params) => <StatusChip status={params.value} domain="brand" />,
  },
];

export default function BrandsList() {
  const navigate = useNavigate();
  const { data: brands = [], isLoading } = useApiQuery<Brand[]>(['brands'], '/api/brands');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Brands & Recipes' }]}
        title="Brands & Recipes"
        action={{ label: 'Add Brand', onClick: () => setDialogOpen(true) }}
      />

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={brands}
          columns={columns}
          loading={isLoading}
          autoHeight
          disableRowSelectionOnClick
          sx={{ cursor: 'pointer' }}
          onRowClick={(params) => navigate(`/brands/${params.id}`)}
        />
      </Paper>

      <BrandFormDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
