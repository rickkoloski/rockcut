import { useCallback, useState, useRef, useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Undo,
  Redo,
  Trash2,
  GripVertical,
  AlignCenterVertical,
  AlignCenterHorizontal,
  RotateCcwSquare,
  RotateCwSquare,
} from 'lucide-react'
import { cn } from '@wf/lib/utils'
import { useWorkflowStore } from '@wf/stores'

interface ToolbarButtonProps {
  onClick: () => void
  disabled?: boolean
  title: string
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'destructive'
}

function ToolbarButton({
  onClick,
  disabled,
  title,
  children,
  variant = 'default',
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'default' && 'hover:bg-accent',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
      )}
    >
      {children}
    </button>
  )
}

function ToolbarDivider({ vertical = false }: { vertical?: boolean }) {
  return vertical
    ? <div className="h-px w-6 bg-border my-1" />
    : <div className="w-px h-6 bg-border mx-1" />
}

export type ToolbarOrientation = 'horizontal' | 'vertical'

interface ToolbarProps {
  orientation?: ToolbarOrientation
  onOrientationChange?: (orientation: ToolbarOrientation) => void
}

/**
 * Editor toolbar with canvas and editing controls.
 *
 * Execution controls (Start, Next Step, Stop) are managed by the host
 * application (WorkflowMonitor) rather than the widget itself.
 *
 * The toolbar is draggable via the grip handle on the left/top.
 */
export function Toolbar({ orientation = 'horizontal', onOrientationChange }: ToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const undo = useWorkflowStore((state) => state.undo)
  const redo = useWorkflowStore((state) => state.redo)
  const historyIndex = useWorkflowStore((state) => state.historyIndex)
  const history = useWorkflowStore((state) => state.history)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const selectedEdgeId = useWorkflowStore((state) => state.selectedEdgeId)
  const deleteNode = useWorkflowStore((state) => state.deleteNode)
  const deleteEdge = useWorkflowStore((state) => state.deleteEdge)
  const nodes = useWorkflowStore((state) => state.nodes)
  const alignNodesVertical = useWorkflowStore((state) => state.alignNodesVertical)
  const alignNodesHorizontal = useWorkflowStore((state) => state.alignNodesHorizontal)

  // Drag state - load initial position from localStorage
  const STORAGE_KEY = 'workflow-toolbar-position'
  const [offset, setOffset] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as { x: number; y: number }
      }
    } catch {
      // Ignore parse errors
    }
    return { x: 0, y: 0 }
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  // Persist position to localStorage when dragging ends
  useEffect(() => {
    if (!isDragging && (offset.x !== 0 || offset.y !== 0)) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(offset))
      } catch {
        // Ignore storage errors
      }
    }
  }, [isDragging, offset])

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1
  const canDelete = selectedNodeId !== null || selectedEdgeId !== null
  const selectedCount = nodes.filter((n) => n.selected).length
  const canAlign = selectedCount >= 2

  const isVertical = orientation === 'vertical'

  const handleToggleOrientation = useCallback(() => {
    onOrientationChange?.(isVertical ? 'horizontal' : 'vertical')
  }, [isVertical, onOrientationChange])

  const handleDelete = useCallback(() => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId)
    } else if (selectedEdgeId) {
      deleteEdge(selectedEdgeId)
    }
  }, [selectedNodeId, selectedEdgeId, deleteNode, deleteEdge])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStart.current = {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    }

    const handleMouseMove = (e: MouseEvent) => {
      setOffset({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [offset])

  return (
    <div
      className={cn(
        'flex gap-1 bg-background border rounded-lg shadow-md',
        isVertical ? 'flex-col px-1 py-2' : 'flex-row items-center px-2 py-1'
      )}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        cursor: isDragging ? 'grabbing' : undefined,
      }}
    >
      {/* Drag handle */}
      <div
        className={cn(
          'flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground',
          isVertical ? 'mb-1' : 'mr-1'
        )}
        onMouseDown={handleMouseDown}
        title="Drag to move"
      >
        <GripVertical className={cn('w-4 h-4', isVertical && 'rotate-90')} />
      </div>

      {/* Orientation toggle */}
      <ToolbarButton
        onClick={handleToggleOrientation}
        title={isVertical ? 'Switch to horizontal' : 'Switch to vertical'}
      >
        {isVertical ? <RotateCwSquare className="w-4 h-4" /> : <RotateCcwSquare className="w-4 h-4" />}
      </ToolbarButton>

      <ToolbarDivider vertical={isVertical} />

      {/* Zoom controls */}
      <ToolbarButton onClick={() => zoomOut()} title="Zoom Out">
        <ZoomOut className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => zoomIn()} title="Zoom In">
        <ZoomIn className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={() => fitView()} title="Fit View">
        <Maximize className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider vertical={isVertical} />

      {/* History controls */}
      <ToolbarButton onClick={undo} disabled={!canUndo} title="Undo">
        <Undo className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={redo} disabled={!canRedo} title="Redo">
        <Redo className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider vertical={isVertical} />

      {/* Delete */}
      <ToolbarButton onClick={handleDelete} disabled={!canDelete} title="Delete Selected">
        <Trash2 className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider vertical={isVertical} />

      {/* Alignment */}
      <ToolbarButton onClick={alignNodesVertical} disabled={!canAlign} title="Align Vertical Center">
        <AlignCenterVertical className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton onClick={alignNodesHorizontal} disabled={!canAlign} title="Align Horizontal Center">
        <AlignCenterHorizontal className="w-4 h-4" />
      </ToolbarButton>
    </div>
  )
}
