// src/index.ts

/**
 * workflow-editor-ui
 *
 * A React-based BPM workflow editor with visual canvas,
 * node types, execution state visualization, and Zustand stores.
 *
 * @packageDocumentation
 */

// === Components ===
export { WorkflowEditor } from '@wf/components/WorkflowEditor'
export { PropertiesPanel } from '@wf/components/properties/PropertiesPanel'
export { EdgePropertiesPanel } from '@wf/components/properties/EdgePropertiesPanel'
export { PaletteContent, type PaletteContentProps } from '@wf/components/palette'

// === Stores ===
export { useWorkflowStore } from '@wf/stores/workflowStore'
export { useExecutionStore } from '@wf/stores/executionStore'

// === Types ===
export type {
  // Core workflow types
  Plan,
  Step,
  Transition,
  Condition,
  Command,
  CommandType,

  // Execution types
  ExecutionContext,
  Token,
  StepResult,

  // React Flow types
  WorkflowNode,
  WorkflowNodeData,
  WorkflowEdge,
  WorkflowEdgeData,

  // Enums/unions
  StepType,
  TransitionType,
  ExecutionState,
  EditorMode,
  EdgePathType,

  // Schemas
  ParameterSchema,
  CommandTypeUIMetadata,
  Permissions,
} from '@wf/types'
