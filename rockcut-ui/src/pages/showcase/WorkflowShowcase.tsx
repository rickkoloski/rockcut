import { useEffect, useRef } from 'react'
import { Box, Typography, Chip, Paper } from '@mui/material'
import PageHeader from '../../components/PageHeader'
import { WorkflowEditor, useWorkflowStore, useExecutionStore } from 'workflow-editor-ui'
import type { Plan, ExecutionContext, ExecutionState } from 'workflow-editor-ui'

// Import workflow editor styles (CSS variables + React Flow overrides)
import 'workflow-editor-ui/styles/index.css'

// ---------------------------------------------------------------------------
// Sample Data: IPA Brewing Process as a Workflow Plan
// ---------------------------------------------------------------------------

const brewingProcess: Plan = {
  id: 'brew-process-1',
  name: 'IPA Brewing Process',
  description: 'Standard brewing workflow for Test IPA',
  steps: [
    // Start
    { id: 'start', plan_id: 'brew-process-1', step_type: 'action', name: 'Prepare Equipment', position: { x: 400, y: 50 } },

    // Mash with decision
    { id: 'mash-decision', plan_id: 'brew-process-1', step_type: 'decision', name: 'Mash Type?', position: { x: 400, y: 150 } },
    { id: 'single-infusion', plan_id: 'brew-process-1', step_type: 'action', name: 'Single Infusion Mash\n(152\u00B0F, 60 min)', position: { x: 200, y: 250 } },
    { id: 'step-mash', plan_id: 'brew-process-1', step_type: 'action', name: 'Step Mash\n(122\u00B0F \u2192 152\u00B0F \u2192 170\u00B0F)', position: { x: 600, y: 250 } },

    // Lauter
    { id: 'lauter', plan_id: 'brew-process-1', step_type: 'action', name: 'Lauter & Sparge\n(45 min)', position: { x: 400, y: 350 } },

    // Boil
    { id: 'boil', plan_id: 'brew-process-1', step_type: 'action', name: 'Boil\n(60 min)', position: { x: 400, y: 450 } },

    // Post-boil
    { id: 'whirlpool', plan_id: 'brew-process-1', step_type: 'action', name: 'Whirlpool/Hop Stand\n(20 min)', position: { x: 400, y: 550 } },
    { id: 'chill', plan_id: 'brew-process-1', step_type: 'action', name: 'Chill to Pitch Temp', position: { x: 400, y: 650 } },

    // Fermentation
    { id: 'pitch', plan_id: 'brew-process-1', step_type: 'action', name: 'Pitch Yeast', position: { x: 400, y: 750 } },
    { id: 'fermentation', plan_id: 'brew-process-1', step_type: 'wait', name: 'Primary Fermentation\n(7-14 days)', position: { x: 400, y: 850 } },

    // Cold crash with decision
    { id: 'crash-decision', plan_id: 'brew-process-1', step_type: 'decision', name: 'Crash Type?', position: { x: 400, y: 950 } },
    { id: 'single-crash', plan_id: 'brew-process-1', step_type: 'action', name: 'Single Cold Crash\n(34\u00B0F, 3 days)', position: { x: 200, y: 1050 } },
    { id: 'step-crash', plan_id: 'brew-process-1', step_type: 'action', name: 'Step Crash\n(50\u00B0F \u2192 40\u00B0F \u2192 34\u00B0F)', position: { x: 600, y: 1050 } },

    // Packaging
    { id: 'packaging', plan_id: 'brew-process-1', step_type: 'action', name: 'Transfer to Brite\n& Package', position: { x: 400, y: 1150 } },

    // End
    { id: 'complete', plan_id: 'brew-process-1', step_type: 'terminal', name: 'Batch Complete', position: { x: 400, y: 1250 } },
  ],
  transitions: [
    { id: 't1', plan_id: 'brew-process-1', from_step_id: 'start', to_step_id: 'mash-decision', transition_type: 'standard' },
    { id: 't2', plan_id: 'brew-process-1', from_step_id: 'mash-decision', to_step_id: 'single-infusion', transition_type: 'standard', condition_id: 'c1' },
    { id: 't3', plan_id: 'brew-process-1', from_step_id: 'mash-decision', to_step_id: 'step-mash', transition_type: 'standard', condition_id: 'c2' },
    { id: 't4', plan_id: 'brew-process-1', from_step_id: 'single-infusion', to_step_id: 'lauter', transition_type: 'standard' },
    { id: 't5', plan_id: 'brew-process-1', from_step_id: 'step-mash', to_step_id: 'lauter', transition_type: 'standard' },
    { id: 't6', plan_id: 'brew-process-1', from_step_id: 'lauter', to_step_id: 'boil', transition_type: 'standard' },
    { id: 't7', plan_id: 'brew-process-1', from_step_id: 'boil', to_step_id: 'whirlpool', transition_type: 'standard' },
    { id: 't8', plan_id: 'brew-process-1', from_step_id: 'whirlpool', to_step_id: 'chill', transition_type: 'standard' },
    { id: 't9', plan_id: 'brew-process-1', from_step_id: 'chill', to_step_id: 'pitch', transition_type: 'standard' },
    { id: 't10', plan_id: 'brew-process-1', from_step_id: 'pitch', to_step_id: 'fermentation', transition_type: 'standard' },
    { id: 't11', plan_id: 'brew-process-1', from_step_id: 'fermentation', to_step_id: 'crash-decision', transition_type: 'standard' },
    { id: 't12', plan_id: 'brew-process-1', from_step_id: 'crash-decision', to_step_id: 'single-crash', transition_type: 'standard', condition_id: 'c3' },
    { id: 't13', plan_id: 'brew-process-1', from_step_id: 'crash-decision', to_step_id: 'step-crash', transition_type: 'standard', condition_id: 'c4' },
    { id: 't14', plan_id: 'brew-process-1', from_step_id: 'single-crash', to_step_id: 'packaging', transition_type: 'standard' },
    { id: 't15', plan_id: 'brew-process-1', from_step_id: 'step-crash', to_step_id: 'packaging', transition_type: 'standard' },
    { id: 't16', plan_id: 'brew-process-1', from_step_id: 'packaging', to_step_id: 'complete', transition_type: 'standard' },
  ],
  conditions: [
    { id: 'c1', name: 'Single Infusion', expression: 'mash_type == "single_infusion"' },
    { id: 'c2', name: 'Step Mash', expression: 'mash_type == "step"' },
    { id: 'c3', name: 'Single Crash', expression: 'crash_type == "single"' },
    { id: 'c4', name: 'Step Crash', expression: 'crash_type == "step"' },
  ],
  commands: [],
}

// ---------------------------------------------------------------------------
// Execution State: Simulating "currently in fermentation"
// ---------------------------------------------------------------------------

const executionContext: ExecutionContext = {
  id: 'exec-1',
  plan_id: 'brew-process-1',
  status: 'running',
  data: { mash_type: 'single_infusion', crash_type: 'single' },
  tokens: [
    { id: 'tok-1', step_id: 'fermentation', status: 'active', created_at: '2026-03-14T06:00:00Z' },
  ],
  started_at: '2026-03-14T06:00:00Z',
}

// Steps that have been completed (path taken: single infusion mash)
const completedStepIds = ['start', 'mash-decision', 'single-infusion', 'lauter', 'boil', 'whirlpool', 'chill', 'pitch']

// Current step
const activeStepId = 'fermentation'

// Steps not yet reached
const pendingStepIds = ['crash-decision', 'single-crash', 'packaging', 'complete']

// Map of step id -> execution state for visualization
const stepExecutionStates: Record<string, ExecutionState> = {}
for (const id of completedStepIds) {
  stepExecutionStates[id] = 'completed'
}
stepExecutionStates[activeStepId] = 'active'
for (const id of pendingStepIds) {
  stepExecutionStates[id] = 'pending'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorkflowShowcase() {
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Load the plan into the workflow store
    const { setPlan, updateNode } = useWorkflowStore.getState()
    setPlan(brewingProcess)

    // Apply execution states to each node so the visual rendering shows progress
    for (const [stepId, state] of Object.entries(stepExecutionStates)) {
      updateNode(stepId, {
        executionState: state,
        tokens: stepId === activeStepId
          ? [{ id: 'tok-1', step_id: stepId, status: 'active', created_at: '2026-03-14T06:00:00Z' }]
          : undefined,
      })
    }

    // Set execution context and mode in the execution store
    const { setExecutionContext, setMode } = useExecutionStore.getState()
    setExecutionContext(executionContext)
    setMode('run')
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <PageHeader
        breadcrumbs={[
          { label: 'Showcase', to: '/showcase' },
          { label: 'Workflow' },
        ]}
        title="Process Tracking: Workflow View"
      />

      <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 0.5 }}>
        Test IPA — Batch #001
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This view shows a brewing process as a flowchart. Decision nodes branch based on process
        profile settings. The active step is highlighted to show current progress.
      </Typography>

      {/* Legend */}
      <Paper variant="outlined" sx={{ px: 2, py: 1, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="caption" sx={{ fontWeight: 600, mr: 1 }}>Legend:</Typography>
        <Chip size="small" label="Completed" sx={{ bgcolor: '#f0fdf4', color: '#22c55e', border: '1px solid #22c55e', fontWeight: 500 }} />
        <Chip size="small" label="Active" sx={{ bgcolor: '#eff6ff', color: '#3b82f6', border: '1px solid #3b82f6', fontWeight: 500 }} />
        <Chip size="small" label="Pending" sx={{ bgcolor: '#f9fafb', color: '#9ca3af', border: '1px solid #9ca3af', fontWeight: 500 }} />
      </Paper>

      {/* Workflow Editor Canvas */}
      <Box sx={{ flexGrow: 1, minHeight: 400, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        <WorkflowEditor hidePalette hidePropertiesPanel />
      </Box>
    </Box>
  )
}
