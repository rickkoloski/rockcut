declare module 'datagrid-extended' {
  import type { DataGridProps } from '@mui/x-data-grid'

  export interface DataGridExtendedProps extends DataGridProps {}
  export function DataGridExtended(props: DataGridExtendedProps): JSX.Element
}
