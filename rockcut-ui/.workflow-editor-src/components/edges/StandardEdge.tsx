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

function StandardEdgeComponent({
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

  // Display custom label if present, otherwise show condition name
  const displayLabel = data?.label || data?.condition?.name

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#ef4444' : '#6b7280', // gray-500
          strokeWidth: selected ? 2.5 : 2,
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
            className="bg-white border border-border rounded px-2 py-0.5 text-xs shadow-sm"
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const StandardEdge = memo(StandardEdgeComponent)
