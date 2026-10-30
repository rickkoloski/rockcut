import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, InputAdornment, MenuItem, Paper, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import type { GridColDef } from '@mui/x-data-grid';
import { DataGridExtended } from 'datagrid-extended';
import PageHeader from '../../components/PageHeader';
import { PageToolbar, SettingsGear } from '../../components/SettingsMenu';
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
  const [search, setSearch] = useState('');

  const filteredBrands = useMemo(() => {
    if (!search) return brands;
    const term = search.toLowerCase();
    return brands.filter((b) =>
      [b.name, b.style, b.status, b.target_abv, b.target_ibu]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [brands, search]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Brands & Recipes' }]}
        title="Brands & Recipes"
      />

      {/* D52: search on the left; Add and the settings gear on the right. */}
      <PageToolbar
        end={
          <>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)} data-testid="brands-add-button">
              Add Brand
            </Button>
            {/* Nothing to set up for brands yet; the gear is here so every page reads the same. */}
            <SettingsGear label="Brand settings" testid="brands-settings">
              {() => (
                <MenuItem disabled data-testid="brands-settings-empty">
                  No settings yet
                </MenuItem>
              )}
            </SettingsGear>
          </>
        }
      >
        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: 260 }}
        />
      </PageToolbar>

      <Paper sx={{ border: '1px solid', borderColor: 'divider' }}>
        <DataGridExtended
          rows={filteredBrands}
          columns={columns}
          columnVisibilityToggle={{ storageKey: 'rockcut:brands:list' }}
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
