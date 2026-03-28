import { memo, type ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@wf/lib/utils'
import type { WorkflowNode, ExecutionState } from '@wf/types'

interface BaseNodeProps extends NodeProps<WorkflowNode> {
  children: ReactNode
  className?: string
  shape?: 'rectangle' | 'diamond' | 'rounded' | 'bar'
  showHandles?: boolean
}

const executionStateStyles: Record<ExecutionState, string> = {
  pending: 'border-gray-400 bg-gray-50',
  active: 'border-blue-500 bg-blue-50 animate-pulse',
  in_progress: 'border-yellow-500 bg-yellow-50 animate-pulse',
  completed: 'border-green-500 bg-green-50',
  failed: 'border-red-500 bg-red-50',
  waiting: 'border-orange-500 bg-orange-50 animate-subtle-pulse',
  blocked: 'border-red-500 ring-2 ring-red-500 bg-red-50',
}

const shapeStyles: Record<NonNullable<BaseNodeProps['shape']>, string> = {
  rectangle: 'rounded-md',
  diamond: 'rotate-45',
  rounded: 'rounded-full',
  bar: 'rounded-sm h-8',
}

function BaseNodeComponent({
  data,
  selected,
  children,
  className,
  shape = 'rectangle',
  showHandles = true,
}: BaseNodeProps) {
  const executionState = data.executionState
  const stateStyle = executionState ? executionStateStyles[executionState] : 'border-gray-300 bg-white'

  return (
    <div
      className={cn(
        'relative border-2 shadow-md transition-all duration-200',
        shapeStyles[shape],
        stateStyle,
        selected && 'ring-2 ring-primary ring-offset-2',
        className
      )}
    >
      {showHandles && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-primary !w-3 !h-3"
        />
      )}

      <div className={cn(shape === 'diamond' && '-rotate-45')}>
        {children}
      </div>

      {showHandles && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-primary !w-3 !h-3"
        />
      )}

      {/* Token indicators */}
      {data.tokens && data.tokens.length > 0 && (
        <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {data.tokens.length}
        </div>
      )}
    </div>
  )
}

export const BaseNode = memo(BaseNodeComponent)
