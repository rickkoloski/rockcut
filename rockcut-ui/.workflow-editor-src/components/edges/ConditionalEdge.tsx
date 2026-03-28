import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { WorkflowEdge } from '@wf/types'
import { useWorkflowStore } from '@wf/stores'

/**
 * Conditional edge component (D40).
 *
 * Renders a dashed edge for conditional transitions,
 * with the condition name displayed as a label.
 */
function ConditionalEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<WorkflowEdge>) {
  const defaultPathType = useWorkflowStore((state) => state.defaultEdgePathType)
  const pathType = data?.pathType || defaultPathType

  // Get the path based on the path type
  const pathParams = {
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  }

  const [edgePath, labelX, labelY] = pathType === 'smoothstep'
    ? getSmoothStepPath(pathParams)
    : getBezierPath(pathParams)

  // Display condition name for conditional edges
  const displayLabel = data?.label || data?.condition?.name

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#ef4444' : '#6366f1', // Indigo for conditional, red when selected
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: '5,3', // Dashed line for conditional edges
        }}
      />
      {displayLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 text-xs shadow-sm text-indigo-700"
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const ConditionalEdge = memo(ConditionalEdgeComponent)
