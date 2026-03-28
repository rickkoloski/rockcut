import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Layers } from 'lucide-react'
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

// Rectangle dimensions
const WIDTH = 180
const HEIGHT = 56
const RADIUS = 8
const PADDING = 4

function SubprocessNodeComponent({ data, selected }: NodeProps<WorkflowNode>) {
  const executionState = data.executionState
  const colors = executionState ? executionStateColors[executionState] : defaultColors

  // Use red stroke when selected, otherwise use execution state color
  const strokeColor = selected ? '#ef4444' : colors.stroke
  const strokeWidth = selected ? 3 : 2

  return (
    <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
      {/* SVG Double-bordered Rectangle Shape (subprocess indicator) */}
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))' }}
      >
        {/* Outer rectangle */}
        <rect
          x={PADDING}
          y={PADDING}
          width={WIDTH - PADDING * 2}
          height={HEIGHT - PADDING * 2}
          rx={RADIUS}
          ry={RADIUS}
          fill={colors.fill}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          className="transition-all duration-200"
        />
        {/* Inner rectangle (double border effect) */}
        <rect
          x={PADDING + 4}
          y={PADDING + 4}
          width={WIDTH - PADDING * 2 - 8}
          height={HEIGHT - PADDING * 2 - 8}
          rx={RADIUS - 2}
          ry={RADIUS - 2}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1}
          className="transition-all duration-200"
        />
      </svg>

      {/* Content overlay */}
      <div className="absolute inset-0 flex items-center gap-2 px-5 pointer-events-none">
        <Layers className="w-4 h-4 text-purple-500 flex-shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-sm truncate">{data.step.name}</span>
          {!!data.step.config?.subprocess_plan_id && (
            <span className="text-xs text-muted-foreground truncate">
              Plan: {String(data.step.config.subprocess_plan_id)}
            </span>
          )}
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-primary !w-3 !h-3"
        style={{ top: -4, left: '50%', transform: 'translateX(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-primary !w-3 !h-3"
        style={{ bottom: -4, left: '50%', transform: 'translateX(-50%)' }}
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

export const SubprocessNode = memo(SubprocessNodeComponent)
