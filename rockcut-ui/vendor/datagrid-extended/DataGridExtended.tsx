// Vendored stub of datagrid-extended (task 3999). The app imports
// 'datagrid-extended' through the Vite alias in vite.config.ts; TypeScript uses
// the ambient types in src/datagrid-extended.d.ts. The plain MUI grid is the
// intended behavior (Rick, discussion 80, msg 83601). If the real package
// (formula columns, remote values) comes back, it replaces this folder.
import { DataGrid } from '@mui/x-data-grid'
import type { DataGridProps } from '@mui/x-data-grid'

export interface DataGridExtendedProps extends DataGridProps {}

export function DataGridExtended(props: DataGridExtendedProps) {
  return <DataGrid {...props} />
}
