import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
  addEdge,
} from '@xyflow/react'
import type {
  WorkflowNode,
  WorkflowEdge,
  Plan,
  Step,
  Transition,
  Command,
  Condition,
  CommandType,
  StepType,
  TransitionType,
  EdgePathType,
} from '@wf/types'

interface WorkflowState {
  // Current plan
  plan: Plan | null

  // React Flow state
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]

  // Selection state
  selectedNodeId: string | null
  selectedEdgeId: string | null

  // Command types catalog (from API)
  commandTypes: CommandType[]

  // Default edge path type preference
  defaultEdgePathType: EdgePathType

  // UI state
  paletteCollapsed: boolean

  // History for undo/redo
  history: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }[]
  historyIndex: number

  // Actions
  setPlan: (plan: Plan) => void
  setNodes: (nodes: WorkflowNode[]) => void
  setEdges: (edges: WorkflowEdge[]) => void
  onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void
  onConnect: (connection: Connection) => void

  // Node operations
  addNode: (stepType: StepType, position: { x: number; y: number }, commandTypeId?: string) => void
  updateNode: (nodeId: string, data: Partial<WorkflowNode['data']>) => void
  deleteNode: (nodeId: string) => void

  // Edge operations
  updateEdge: (edgeId: string, data: Partial<WorkflowEdge['data']>) => void
  deleteEdge: (edgeId: string) => void

  // Selection
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void

  // Command types
  setCommandTypes: (types: CommandType[]) => void

  // Edge preferences
  setDefaultEdgePathType: (pathType: EdgePathType) => void

  // UI state
  setPaletteCollapsed: (collapsed: boolean) => void

  // History
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // Alignment
  alignNodesVertical: () => void
  alignNodesHorizontal: () => void

  // Save
  isSaving: boolean
  saveError: string | null
  lastSaved: Date | null
  savePlan: () => Promise<{ success: boolean; error?: string }>

  // Utilities
  getSelectedNode: () => WorkflowNode | undefined
  getSelectedEdge: () => WorkflowEdge | undefined
  toBackendPlan: () => Plan | null
}

const createNodeId = () => `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
const createEdgeId = () => `transition-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const useWorkflowStore = create<WorkflowState>()(
  devtools(
    persist(
      (set, get) => ({
        plan: null,
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null,
        commandTypes: [],
        defaultEdgePathType: 'bezier',
        paletteCollapsed: false,
        history: [],
        historyIndex: -1,
        isSaving: false,
        saveError: null,
        lastSaved: null,

        setPlan: (plan) => {
          const nodes: WorkflowNode[] = plan.steps.map((step) => ({
            id: step.id,
            type: step.step_type,
            position: step.position,
            data: {
              step,
              command: plan.commands.find((c) => c.id === step.command_id),
              commandType: get().commandTypes.find(
                (ct) => ct.id === plan.commands.find((c) => c.id === step.command_id)?.command_type_id
              ),
            },
          }))

          const edges: WorkflowEdge[] = plan.transitions.map((transition) => ({
            id: transition.id,
            source: transition.from_step_id,
            target: transition.to_step_id,
            type: transition.transition_type,
            data: {
              transition,
              condition: plan.conditions.find((c) => c.id === transition.condition_id),
            },
          }))

          set({ plan, nodes, edges, selectedNodeId: null, selectedEdgeId: null })
        },

        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),

        onNodesChange: (changes) => {
          set({
            nodes: applyNodeChanges(changes, get().nodes) as WorkflowNode[],
          })
        },

        onEdgesChange: (changes) => {
          set({
            edges: applyEdgeChanges(changes, get().edges) as WorkflowEdge[],
          })
        },

        onConnect: (connection) => {
          const defaultPathType = get().defaultEdgePathType
          const newEdge: WorkflowEdge = {
            id: createEdgeId(),
            source: connection.source!,
            target: connection.target!,
            type: 'standard',
            data: {
              transition: {
                id: createEdgeId(),
                plan_id: get().plan?.id || '',
                from_step_id: connection.source!,
                to_step_id: connection.target!,
                transition_type: 'standard' as TransitionType,
              },
              pathType: defaultPathType,
            },
          }
          get().pushHistory()
          set({
            edges: addEdge(newEdge, get().edges) as WorkflowEdge[],
          })
        },

        addNode: (stepType, position, commandTypeId) => {
          const id = createNodeId()
          const commandType = commandTypeId
            ? get().commandTypes.find((ct) => ct.id === commandTypeId)
            : undefined

          const step: Step = {
            id,
            plan_id: get().plan?.id || '',
            step_type: stepType,
            name: commandType?.name || `New ${stepType}`,
            position,
          }

          let command: Command | undefined
          if (commandType && stepType === 'action') {
            command = {
              id: `cmd-${id}`,
              command_type_id: commandType.id,
              parameters: {},
            }
            step.command_id = command.id
          }

          const newNode: WorkflowNode = {
            id,
            type: stepType,
            position,
            data: {
              step,
              command,
              commandType,
            },
          }

          get().pushHistory()
          set({
            nodes: [...get().nodes, newNode],
          })
        },

        updateNode: (nodeId, data) => {
          get().pushHistory()
          set({
            nodes: get().nodes.map((node) =>
              node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
            ),
          })
        },

        deleteNode: (nodeId) => {
          get().pushHistory()
          set({
            nodes: get().nodes.filter((node) => node.id !== nodeId),
            edges: get().edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId
            ),
            selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
          })
        },

        updateEdge: (edgeId, data) => {
          get().pushHistory()
          set({
            edges: get().edges.map((edge) =>
              edge.id === edgeId ? { ...edge, data: { ...edge.data!, ...data } } : edge
            ),
          })
        },

        deleteEdge: (edgeId) => {
          get().pushHistory()
          set({
            edges: get().edges.filter((edge) => edge.id !== edgeId),
            selectedEdgeId: get().selectedEdgeId === edgeId ? null : get().selectedEdgeId,
          })
        },

        selectNode: (nodeId) => {
          set({ selectedNodeId: nodeId, selectedEdgeId: null })
        },

        selectEdge: (edgeId) => {
          set({ selectedEdgeId: edgeId, selectedNodeId: null })
        },

        setCommandTypes: (types) => set({ commandTypes: types }),

        setDefaultEdgePathType: (pathType) => set({ defaultEdgePathType: pathType }),

        setPaletteCollapsed: (collapsed) => set({ paletteCollapsed: collapsed }),

        undo: () => {
          const { history, historyIndex } = get()
          if (historyIndex > 0) {
            const prevState = history[historyIndex - 1]
            set({
              nodes: prevState.nodes,
              edges: prevState.edges,
              historyIndex: historyIndex - 1,
            })
          }
        },

        redo: () => {
          const { history, historyIndex } = get()
          if (historyIndex < history.length - 1) {
            const nextState = history[historyIndex + 1]
            set({
              nodes: nextState.nodes,
              edges: nextState.edges,
              historyIndex: historyIndex + 1,
            })
          }
        },

        pushHistory: () => {
          const { nodes, edges, history, historyIndex } = get()
          const newHistory = history.slice(0, historyIndex + 1)
          newHistory.push({ nodes: [...nodes], edges: [...edges] })
          // Keep only last 50 states
          if (newHistory.length > 50) {
            newHistory.shift()
          }
          set({
            history: newHistory,
            historyIndex: newHistory.length - 1,
          })
        },

        alignNodesVertical: () => {
          const { nodes } = get()
          const selectedNodes = nodes.filter((n) => n.selected)

          if (selectedNodes.length < 2) return

          // Helper to get node width (React Flow stores measured dimensions in node.measured)
          const getWidth = (n: WorkflowNode) => n.measured?.width ?? n.width ?? 180

          // Calculate center X of selection bounds
          const minX = Math.min(...selectedNodes.map((n) => n.position.x))
          const maxX = Math.max(...selectedNodes.map((n) => n.position.x + getWidth(n)))
          const centerX = (minX + maxX) / 2

          // Update positions
          get().pushHistory()
          set({
            nodes: nodes.map((node) => {
              if (!node.selected) return node
              const nodeWidth = getWidth(node)
              return {
                ...node,
                position: {
                  ...node.position,
                  x: centerX - nodeWidth / 2,
                },
              }
            }),
          })
        },

        alignNodesHorizontal: () => {
          const { nodes } = get()
          const selectedNodes = nodes.filter((n) => n.selected)

          if (selectedNodes.length < 2) return

          // Helper to get node height (React Flow stores measured dimensions in node.measured)
          const getHeight = (n: WorkflowNode) => n.measured?.height ?? n.height ?? 56

          // Calculate center Y of selection bounds
          const minY = Math.min(...selectedNodes.map((n) => n.position.y))
          const maxY = Math.max(...selectedNodes.map((n) => n.position.y + getHeight(n)))
          const centerY = (minY + maxY) / 2

          // Update positions
          get().pushHistory()
          set({
            nodes: nodes.map((node) => {
              if (!node.selected) return node
              const nodeHeight = getHeight(node)
              return {
                ...node,
                position: {
                  ...node.position,
                  y: centerY - nodeHeight / 2,
                },
              }
            }),
          })
        },

        savePlan: async () => {
          const { plan, nodes } = get()
          if (!plan?.id) return { success: false, error: 'No plan loaded' }

          set({ isSaving: true, saveError: null })

          try {
            const steps = nodes.map((node) => ({
              id: node.data.step.id,
              position: node.position,
            }))

            const response = await fetch(`http://localhost:4000/api/workflow/plans/${plan.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ steps }),
            })

            if (!response.ok) {
              const error = await response.json().catch(() => ({}))
              throw new Error(error.error || `Save failed: ${response.status}`)
            }

            set({ isSaving: false, lastSaved: new Date() })
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Save failed'
            set({ isSaving: false, saveError: message })
            return { success: false, error: message }
          }
        },

        getSelectedNode: () => {
          const { nodes, selectedNodeId } = get()
          return nodes.find((node) => node.id === selectedNodeId)
        },

        getSelectedEdge: () => {
          const { edges, selectedEdgeId } = get()
          return edges.find((edge) => edge.id === selectedEdgeId)
        },

        toBackendPlan: () => {
          const { plan, nodes, edges } = get()
          if (!plan) return null

          const steps: Step[] = nodes.map((node) => ({
            ...node.data.step,
            position: node.position,
          }))

          const transitions: Transition[] = edges
            .filter((edge) => edge.data?.transition)
            .map((edge) => edge.data!.transition)

          const commands: Command[] = nodes
            .filter((node) => node.data.command)
            .map((node) => node.data.command!)

          const conditions: Condition[] = edges
            .filter((edge) => edge.data?.condition)
            .map((edge) => edge.data!.condition!)

          return {
            ...plan,
            steps,
            transitions,
            commands,
            conditions,
          }
        },
      }),
      {
        name: 'workflow-editor-storage',
        partialize: (state) => ({
          plan: state.plan,
          nodes: state.nodes,
          edges: state.edges,
          defaultEdgePathType: state.defaultEdgePathType,
        }),
      }
    )
  )
)
