/**
 * Workflow API client for development/debugging
 *
 * Connects to the Phoenix backend at localhost:4000 for:
 * - Starting workflow executions
 * - Advancing workflow steps
 * - Fetching plan data
 */

const API_BASE = 'http://localhost:4000/api'

// Hardcoded demo plan name for testing
export const DEMO_PLAN_NAME = 'healthcare_appointment_reminder_v2'

export interface StepResponse {
  id: string
  plan_id: string
  step_type: string
  title: string
  name?: string
  description?: string
  command_id?: string
  position?: { x: number; y: number }
}

export interface TransitionResponse {
  id: string
  plan_id: string
  from_step_id: string
  to_step_id: string
  transition_type: string
  condition_id?: string
}

export interface ConditionResponse {
  id: string
  name: string
  expression: string
  expression_type: string
}

export interface CommandResponse {
  id: string
  command_type_id: string
  parameters: Record<string, unknown>
}

export interface CommandTypeResponse {
  id: string
  name: string
  description: string
  parameter_schema: Record<string, unknown>
  ui_metadata: {
    category: string
    icon?: string
    palette_visible: boolean
  }
  status: string
}

export interface PlanResponse {
  id: string
  name: string
  status: string
  start_step_id: string | null
}

export interface FullPlanResponse {
  plan: PlanResponse
  steps: StepResponse[]
  transitions: TransitionResponse[]
  conditions: ConditionResponse[]
  commands: CommandResponse[]
  command_types: CommandTypeResponse[]
}

export interface ExecutionResponse {
  execution_id: string
  plan_id: string
  status: string
  current_step: {
    id: string
    title: string
  } | null
}

export interface AdvanceResponse {
  status: string
  previous_step?: {
    id: string
    title: string
    result?: unknown
  }
  current_step?: {
    id: string
    title: string
  } | null
  message?: string
}

export interface ApiError {
  error: string
}

/**
 * Fetch a plan with all workflow entities by name (or UUID)
 * The API supports looking up by either name or UUID in the path
 */
export async function getFullPlan(nameOrId: string): Promise<FullPlanResponse> {
  const response = await fetch(`${API_BASE}/workflow/plans/${encodeURIComponent(nameOrId)}`)

  if (!response.ok) {
    const error: ApiError = await response.json()
    throw new Error(error.error || `Failed to fetch plan: ${response.status}`)
  }

  return response.json()
}

/**
 * Fetch just the plan metadata by name (or UUID)
 */
export async function getPlanByName(name: string): Promise<PlanResponse> {
  const data = await getFullPlan(name)
  return data.plan
}

/**
 * Fetch a plan by ID
 */
export async function getPlan(planId: string): Promise<PlanResponse> {
  const response = await fetch(`${API_BASE}/workflow/plans/${planId}`)

  if (!response.ok) {
    const error: ApiError = await response.json()
    throw new Error(error.error || `Failed to fetch plan: ${response.status}`)
  }

  return response.json()
}

/**
 * Create a new execution for a plan
 */
export async function createExecution(
  planId: string,
  initialContext?: Record<string, unknown>
): Promise<ExecutionResponse> {
  const response = await fetch(`${API_BASE}/workflow/executions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: planId,
      initial_context: initialContext || {},
    }),
  })

  if (!response.ok) {
    const error: ApiError = await response.json()
    throw new Error(error.error || `Failed to create execution: ${response.status}`)
  }

  return response.json()
}

/**
 * Get execution state
 */
export async function getExecution(executionId: string): Promise<ExecutionResponse> {
  const response = await fetch(`${API_BASE}/workflow/executions/${executionId}`)

  if (!response.ok) {
    const error: ApiError = await response.json()
    throw new Error(error.error || `Failed to get execution: ${response.status}`)
  }

  return response.json()
}

/**
 * Advance the execution to the next step
 */
export async function advanceExecution(executionId: string): Promise<AdvanceResponse> {
  const response = await fetch(`${API_BASE}/workflow/executions/${executionId}/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error: ApiError = await response.json()
    throw new Error(error.error || `Failed to advance execution: ${response.status}`)
  }

  return response.json()
}

/**
 * Convert API response to the Plan format expected by workflowStore
 */
export function convertToPlan(data: FullPlanResponse) {
  // Default positions for steps that don't have them
  const DEFAULT_POSITIONS: Record<number, { x: number; y: number }> = {
    0: { x: 100, y: 100 },
    1: { x: 100, y: 250 },
    2: { x: 100, y: 400 },
    3: { x: -150, y: 550 },
    4: { x: 100, y: 550 },
    5: { x: 350, y: 550 },
    6: { x: -150, y: 700 },
    7: { x: 100, y: 700 },
    8: { x: 350, y: 700 },
  }

  return {
    id: data.plan.id,
    name: data.plan.name,
    description: undefined,
    start_step_id: data.plan.start_step_id || undefined,
    steps: data.steps.map((step, index) => ({
      id: step.id,
      plan_id: step.plan_id,
      step_type: step.step_type as 'action' | 'decision' | 'wait' | 'subprocess' | 'join' | 'terminal',
      name: step.title || step.name || `Step ${index + 1}`,
      description: step.description,
      command_id: step.command_id,
      position: step.position ?? DEFAULT_POSITIONS[index] ?? {
        x: 100 + (index % 3) * 250,
        y: 100 + Math.floor(index / 3) * 150,
      },
    })),
    transitions: data.transitions.map((t) => ({
      id: t.id,
      plan_id: t.plan_id,
      from_step_id: t.from_step_id,
      to_step_id: t.to_step_id,
      transition_type: t.transition_type as 'standard' | 'parallel_fork' | 'default',
      condition_id: t.condition_id,
    })),
    conditions: data.conditions.map((c) => ({
      id: c.id,
      name: c.name,
      expression: c.expression,
    })),
    commands: data.commands.map((c) => ({
      id: c.id,
      command_type_id: c.command_type_id,
      parameters: c.parameters,
    })),
  }
}

/**
 * Convert API command types to the format expected by workflowStore
 */
export function convertCommandTypes(data: FullPlanResponse) {
  return data.command_types.map((ct) => ({
    id: ct.id,
    name: ct.name,
    description: ct.description,
    // Cast to any to avoid strict type checking on the parameter_schema
    // The backend schema structure may not match exactly
    parameter_schema: ct.parameter_schema as unknown as Record<string, {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array'
      description?: string
      default?: unknown
      required?: boolean
    }>,
    ui_metadata: {
      category: ct.ui_metadata.category,
      icon: ct.ui_metadata.icon,
      palette_visible: ct.ui_metadata.palette_visible,
    },
    status: ct.status as 'active' | 'deprecated' | 'draft',
  }))
}

/**
 * Healthcare demo initial context
 */
export const HEALTHCARE_INITIAL_CONTEXT = {
  patient: {
    name: 'Maria Santos',
    first_name: 'Maria',
    phone: '+1 (555) 012-3456',
    email: 'maria.santos@email.com',
    mrn: '2847591',
  },
  appointment: {
    time: 'Tomorrow, 10:00 AM',
    location: 'Suite 302',
    type: 'Follow-up',
  },
  provider: {
    name: 'Dr. Sarah Mitchell',
    specialty: 'Internal Medicine',
  },
  organization: {
    name: 'Meridian Health',
    phone: '(555) 012-3456',
  },
}
