import type { Node, Edge } from '@xyflow/react'

/**
 * Step types that define the visual and behavioral characteristics of workflow nodes
 */
export type StepType = 'action' | 'decision' | 'wait' | 'subprocess' | 'join' | 'terminal'

/**
 * Transition types that define how edges are rendered
 */
export type TransitionType = 'standard' | 'parallel_fork' | 'default'

/**
 * Edge path types (curved vs orthogonal)
 */
export type EdgePathType = 'bezier' | 'smoothstep'

/**
 * Execution states for nodes during workflow execution
 */
export type ExecutionState = 'pending' | 'active' | 'in_progress' | 'completed' | 'failed' | 'waiting' | 'blocked'

/**
 * Command parameter schema for dynamic form generation
 */
export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  default?: unknown
  required?: boolean
  enum?: string[]
  properties?: Record<string, ParameterSchema>
  items?: ParameterSchema
}

/**
 * UI metadata for CommandType display in palette
 */
export interface CommandTypeUIMetadata {
  icon?: string
  category: string
  palette_visible: boolean
  color?: string
}

/**
 * CommandType catalog entry (from backend)
 */
export interface CommandType {
  id: string
  name: string
  description: string
  parameter_schema: Record<string, ParameterSchema>
  result_schema?: Record<string, ParameterSchema>
  ui_metadata: CommandTypeUIMetadata
  status: 'active' | 'deprecated' | 'draft'
}

/**
 * Command instance (user-configured)
 */
export interface Command {
  id: string
  command_type_id: string
  parameters: Record<string, unknown>
}

/**
 * Condition for conditional transitions
 */
export interface Condition {
  id: string
  name: string
  expression: string
  priority?: number
}

/**
 * Step (backend entity) - maps to UI Node
 */
export interface Step {
  id: string
  plan_id: string
  step_type: StepType
  name: string
  description?: string
  command_id?: string
  config?: Record<string, unknown>
  position: { x: number; y: number }
}

/**
 * Transition (backend entity) - maps to UI Edge
 */
export interface Transition {
  id: string
  plan_id: string
  from_step_id: string
  to_step_id: string
  transition_type: TransitionType
  condition_id?: string
}

/**
 * Plan (workflow definition)
 */
export interface Plan {
  id: string
  name: string
  description?: string
  start_step_id?: string
  steps: Step[]
  transitions: Transition[]
  conditions: Condition[]
  commands: Command[]
  version?: number
  created_at?: string
  updated_at?: string
}

/**
 * Execution token position
 */
export interface Token {
  id: string
  step_id: string
  status: ExecutionState
  created_at: string
}

/**
 * Execution context (runtime state)
 */
export interface ExecutionContext {
  id: string
  plan_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  data: Record<string, unknown>  // blackboard
  tokens: Token[]
  started_at?: string
  completed_at?: string
}

/**
 * Step execution result
 */
export interface StepResult {
  step_id: string
  token_id: string
  status: 'completed' | 'failed'
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: {
    message: string
    stack?: string
  }
  started_at: string
  completed_at: string
  duration_ms: number
}

/**
 * Custom node data for React Flow
 */
export interface WorkflowNodeData extends Record<string, unknown> {
  step: Step
  command?: Command
  commandType?: CommandType
  executionState?: ExecutionState
  tokens?: Token[]
  result?: StepResult
}

/**
 * Custom edge data for React Flow
 */
export interface WorkflowEdgeData extends Record<string, unknown> {
  transition: Transition
  condition?: Condition
  label?: string
  pathType?: EdgePathType
}

/**
 * React Flow node type with our custom data
 */
export type WorkflowNode = Node<WorkflowNodeData, string>

/**
 * React Flow edge type with our custom data
 */
export type WorkflowEdge = Edge<WorkflowEdgeData, string>

/**
 * RBAC permissions
 */
export interface Permissions {
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canExecute: boolean
}

/**
 * Editor modes
 */
export type EditorMode = 'design' | 'run' | 'debug' | 'replay'
