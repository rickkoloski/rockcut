import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import type { WorkflowNode, ExecutionState } from '@wf/types'

// SVG color mappings for execution states
const executionStateColors: Record<ExecutionState, { stroke: string; fill: string }> = {
  pending: { stroke: '#9ca3af', fill: '#f9fafb' },      // gray-400, gray-50
  active: { stroke: '#3b82f6', fill: '#eff6ff' },       // blue-500, blue-50
  in_progress: { stroke: '#eab308', fill: '#fefce8' },  // yellow-500, yellow-50
  completed: { stroke: '#22c55e', fill: '#f0fdf4' },    // green-500, green-50
  failed: { stroke: '#ef4444', fill: '#fef2f2' },       // red-500, red-50
  waiting: { stroke: '#f97316', fill: '#fff7ed' },      // orange-500, orange-50
  blocked: { stroke: '#ef4444', fill: '#fef2f2' },      // red-500, red-50
}

const defaultColors = { stroke: '#d1d5db', fill: '#ffffff' } // gray-300, white

// Diamond dimensions
const SIZE = 120
const CENTER = SIZE / 2
const PADDING = 4 // Padding for stroke

// Diamond points (top, right, bottom, left)
const diamondPoints = [
  `${CENTER},${PADDING}`,           // top
  `${SIZE - PADDING},${CENTER}`,    // right
  `${CENTER},${SIZE - PADDING}`,    // bottom
  `${PADDING},${CENTER}`,           // left
].join(' ')

function DecisionNodeComponent({ data, selected }: NodeProps<WorkflowNode>) {
  const executionState = data.executionState
  const colors = executionState ? executionStateColors[executionState] : defaultColors

  // Use red stroke when selected, otherwise use execution state color
  const strokeColor = selected ? '#ef4444' : colors.stroke // red-500 when selected
  const strokeWidth = selected ? 3 : 2

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      {/* SVG Diamond Shape */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))' }}
      >
        {/* Main diamond shape */}
        <polygon
          points={diamondPoints}
          fill={colors.fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          className="transition-all duration-200"
        />
      </svg>

      {/* Content overlay using foreignObject technique */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <GitBranch className="w-5 h-5 text-primary mb-1" />
        <span className="font-medium text-xs text-center px-2 leading-tight max-w-[80px]">
          {data.step.name}
        </span>
      </div>

      {/* Handles positioned on the diamond points */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-3 !h-3"
        style={{ top: PADDING - 6, left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-3 !h-3"
        style={{ bottom: PADDING - 6, left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!bg-primary !w-3 !h-3"
        style={{ left: PADDING - 6, top: '50%', transform: 'translateY(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-primary !w-3 !h-3"
        style={{ right: PADDING - 6, top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* Token indicator */}
      {data.tokens && data.tokens.length > 0 && (
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {data.tokens.length}
        </div>
      )}
    </div>
  )
}

export const DecisionNode = memo(DecisionNodeComponent)
