declare module 'datagrid-extended' {
  import type { DataGridProps, GridColDef, GridValidRowModel } from '@mui/x-data-grid'
  import type { CSSProperties } from 'react'

  export type ExtendedGridColDef = GridColDef & {
    remoteValueGetter?: (row: GridValidRowModel) => Promise<unknown>
    formula?: string
    computed?: boolean
  }

  // `never[]`: any function's parameters fit (task 4084: no `any`).
  export type RemoteFunctions = Record<string, (...args: never[]) => Promise<unknown>>

  export interface CacheStrategy {
    get(key: string): unknown
    set(key: string, value: unknown): void
    invalidateAll(): void
  }

  export type CellState =
    | { status: 'pending' }
    | { status: 'resolved'; value: unknown }
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

  export interface ColumnVisibilityToggleConfig {
    storageKey: string
  }

  // --- Component Props ---

  export interface DataGridExtendedProps extends Omit<DataGridProps, 'columns'> {
    columnVisibilityToggle?: ColumnVisibilityToggleConfig
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
    row: GridValidRowModel,
    allRows: GridValidRowModel[],
    remoteFunctions?: RemoteFunctions,
  ): Promise<unknown>

  // --- D8: Formula editing exports ---

  export function extractFields(expr: Expression): string[]
  export function extractFunctions(expr: Expression): string[]
  export function defaultFunctionCatalog(): FunctionCatalogEntry[]
}
