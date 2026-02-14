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

  // --- D8: Formula Editing UX types ---

  export interface FunctionArgDef {
    name: string
    description?: string
  }

  export interface FunctionCatalogEntry {
    name: string
    description: string
    signature: string
    args: FunctionArgDef[]
  }

  export interface FormulaValidation {
    valid: boolean
    error?: string
    errorPosition?: number
    fields?: string[]
    functions?: string[]
  }

  export interface FormulaEditorState {
    field: string
    headerName: string
    formula: string
    anchorEl: HTMLElement | null
  }

  export interface FieldAutocompleteEntry {
    field: string
    headerName?: string
  }

  // --- Component Props ---

  export interface DataGridExtendedProps extends Omit<DataGridProps, 'columns'> {
    columns: ExtendedGridColDef[]
    remoteFunctions?: RemoteFunctions
    cacheStrategy?: CacheStrategy
    computedCellStyle?: CSSProperties
    formulaEditable?: boolean
    onFormulaChange?: (field: string, formula: string | null) => void
    functionCatalog?: FunctionCatalogEntry[]
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

  // --- D8: Formula editing exports ---

  export function extractFields(expr: Expression): string[]
  export function extractFunctions(expr: Expression): string[]
  export function defaultFunctionCatalog(): FunctionCatalogEntry[]
}
