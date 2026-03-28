import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { GitFork } from 'lucide-react'
import type { WorkflowEdge } from '@wf/types'

function ParallelForkEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
}: EdgeProps<WorkflowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#ef4444' : '#6366f1', // indigo, red when selected
          strokeWidth: selected ? 2.5 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="bg-indigo-100 border border-indigo-300 rounded px-2 py-0.5 text-xs shadow-sm flex items-center gap-1 text-indigo-700"
        >
          <GitFork className="w-3 h-3" />
          Fork
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

export const ParallelForkEdge = memo(ParallelForkEdgeComponent)
