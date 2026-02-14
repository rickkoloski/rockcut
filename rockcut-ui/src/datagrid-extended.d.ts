declare module 'datagrid-extended' {
  import type { DataGridProps, GridColDef } from '@mui/x-data-grid'
  import type { CSSProperties } from 'react'

  export type ExtendedGridColDef = GridColDef & {
    remoteValueGetter?: (row: any) => Promise<any>
    formula?: string
    computed?: boolean
  }

  export type RemoteFunctions = Record<string, (...args: any[]) => Promise<any>>

  export interface CacheStrategy {
    get(key: string): any | undefined
    set(key: string, value: any): void
    invalidateAll(): void
  }

  export type CellState =
    | { status: 'pending' }
    | { status: 'resolved'; value: any }
    | { status: 'error'; message: string }

  export type Expression =
    | { type: 'number'; value: number }
    | { type: 'string'; value: string }
    | { type: 'field'; name: string }
    | { type: 'call'; name: string; args: Expression[] }
    | { type: 'binary'; op: string; left: Expression; right: Expression }
    | { type: 'conditional'; condition: Expression; then: Expression; else: Expression }

  export interface DataGridExtendedProps extends Omit<DataGridProps, 'columns'> {
    columns: ExtendedGridColDef[]
    remoteFunctions?: RemoteFunctions
    cacheStrategy?: CacheStrategy
    computedCellStyle?: CSSProperties
  }

  export function DataGridExtended(props: DataGridExtendedProps): JSX.Element
  export function parseFormula(input: string): Expression
  export class ParseError extends Error {
    position: number
  }
  export function evaluate(
    expr: Expression,
    row: any,
    allRows: any[],
    remoteFunctions?: RemoteFunctions,
  ): Promise<any>
}
