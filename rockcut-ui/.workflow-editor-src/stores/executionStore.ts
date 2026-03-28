import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  ExecutionContext,
  ExecutionState,
  Token,
  StepResult,
  EditorMode,
} from '@wf/types'

interface ExecutionStoreState {
  // Current execution context
  executionContext: ExecutionContext | null

  // Editor mode
  mode: EditorMode

  // Step results cache
  stepResults: Map<string, StepResult>

  // WebSocket connection status
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'

  // Actions
  setExecutionContext: (context: ExecutionContext | null) => void
  setMode: (mode: EditorMode) => void
  setConnectionStatus: (status: ExecutionStoreState['connectionStatus']) => void

  // Token operations
  updateToken: (tokenId: string, update: Partial<Token>) => void
  addToken: (token: Token) => void
  removeToken: (tokenId: string) => void

  // Step state operations
  getStepExecutionState: (stepId: string) => ExecutionState | undefined
  getStepTokens: (stepId: string) => Token[]
  setStepResult: (stepId: string, result: StepResult) => void
  getStepResult: (stepId: string) => StepResult | undefined

  // Execution events (from WebSocket)
  handleTokenMoved: (tokenId: string, fromStepId: string, toStepId: string) => void
  handleTokenCreated: (tokenId: string, stepId: string) => void
  handleTokenCompleted: (tokenId: string, stepId: string) => void
  handleTokenFailed: (tokenId: string, stepId: string, error: string) => void
  handleStepStarted: (stepId: string, tokenId: string) => void
  handleStepCompleted: (stepId: string, result: StepResult) => void
  handleContextUpdated: (data: Record<string, unknown>) => void
  handleExecutionCompleted: (status: string) => void
  handleExecutionFailed: (error: string) => void

  // Reset
  reset: () => void
}

export const useExecutionStore = create<ExecutionStoreState>()(
  devtools(
    (set, get) => ({
      executionContext: null,
      mode: 'design',
      stepResults: new Map(),
      connectionStatus: 'disconnected',

      setExecutionContext: (context) => set({ executionContext: context }),

      setMode: (mode) => set({ mode }),

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      updateToken: (tokenId, update) => {
        const context = get().executionContext
        if (!context) return

        set({
          executionContext: {
            ...context,
            tokens: context.tokens.map((token) =>
              token.id === tokenId ? { ...token, ...update } : token
            ),
          },
        })
      },

      addToken: (token) => {
        const context = get().executionContext
        if (!context) return

        set({
          executionContext: {
            ...context,
            tokens: [...context.tokens, token],
          },
        })
      },

      removeToken: (tokenId) => {
        const context = get().executionContext
        if (!context) return

        set({
          executionContext: {
            ...context,
            tokens: context.tokens.filter((t) => t.id !== tokenId),
          },
        })
      },

      getStepExecutionState: (stepId) => {
        const context = get().executionContext
        if (!context) return undefined

        const token = context.tokens.find((t) => t.step_id === stepId)
        return token?.status
      },

      getStepTokens: (stepId) => {
        const context = get().executionContext
        if (!context) return []
        return context.tokens.filter((t) => t.step_id === stepId)
      },

      setStepResult: (stepId, result) => {
        const newResults = new Map(get().stepResults)
        newResults.set(stepId, result)
        set({ stepResults: newResults })
      },

      getStepResult: (stepId) => {
        return get().stepResults.get(stepId)
      },

      handleTokenMoved: (tokenId, _fromStepId, toStepId) => {
        get().updateToken(tokenId, { step_id: toStepId, status: 'active' })
      },

      handleTokenCreated: (tokenId, stepId) => {
        get().addToken({
          id: tokenId,
          step_id: stepId,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
      },

      handleTokenCompleted: (tokenId, _stepId) => {
        get().updateToken(tokenId, { status: 'completed' })
      },

      handleTokenFailed: (tokenId, _stepId, _error) => {
        get().updateToken(tokenId, { status: 'failed' })
      },

      handleStepStarted: (stepId, _tokenId) => {
        const tokens = get().getStepTokens(stepId)
        tokens.forEach((token) => {
          get().updateToken(token.id, { status: 'in_progress' })
        })
      },

      handleStepCompleted: (stepId, result) => {
        get().setStepResult(stepId, result)
        const tokens = get().getStepTokens(stepId)
        tokens.forEach((token) => {
          get().updateToken(token.id, { status: 'completed' })
        })
      },

      handleContextUpdated: (data) => {
        const context = get().executionContext
        if (!context) return

        set({
          executionContext: {
            ...context,
            data,
          },
        })
      },

      handleExecutionCompleted: (status) => {
        const context = get().executionContext
        if (!context) return

        set({
          executionContext: {
            ...context,
            status: status as ExecutionContext['status'],
            completed_at: new Date().toISOString(),
          },
        })
      },

      handleExecutionFailed: (_error) => {
        const context = get().executionContext
        if (!context) return

        set({
          executionContext: {
            ...context,
            status: 'failed',
            completed_at: new Date().toISOString(),
          },
        })
      },

      reset: () =>
        set({
          executionContext: null,
          mode: 'design',
          stepResults: new Map(),
          connectionStatus: 'disconnected',
        }),
    }),
    { name: 'execution-store' }
  )
)
