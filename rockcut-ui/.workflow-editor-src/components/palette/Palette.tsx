import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Play,
  GitBranch,
  Clock,
  Layers,
  Merge,
  Flag,
  Search,
} from 'lucide-react'
import { cn } from '@wf/lib/utils'
import { useWorkflowStore } from '@wf/stores'
import type { StepType, CommandType } from '@wf/types'

interface PaletteItem {
  type: StepType
  label: string
  icon: React.ReactNode
  description: string
}

// Fixed card width for widget-like appearance
const CARD_WIDTH = 140
const CARD_GAP = 8 // gap-2 = 0.5rem = 8px
const PALETTE_PADDING = 12 // p-3 = 0.75rem = 12px

// Snap points for palette width (in pixels) - calculated from card dimensions
const SNAP_POINTS = {
  ONE_COLUMN: CARD_WIDTH + (PALETTE_PADDING * 2) + 8,        // ~172px
  TWO_COLUMNS: (CARD_WIDTH * 2) + CARD_GAP + (PALETTE_PADDING * 2) + 8,  // ~320px
  THREE_COLUMNS: (CARD_WIDTH * 3) + (CARD_GAP * 2) + (PALETTE_PADDING * 2) + 8, // ~468px
}

const SNAP_THRESHOLD = 40 // Pixels within which to snap

// Get the nearest snap point
function getSnapPoint(width: number): number {
  const points = [SNAP_POINTS.ONE_COLUMN, SNAP_POINTS.TWO_COLUMNS, SNAP_POINTS.THREE_COLUMNS]

  for (const point of points) {
    if (Math.abs(width - point) < SNAP_THRESHOLD) {
      return point
    }
  }

  // If not near a snap point, clamp to valid range
  return Math.max(SNAP_POINTS.ONE_COLUMN, Math.min(SNAP_POINTS.THREE_COLUMNS, width))
}

// Get number of columns based on width
function getColumnCount(width: number): number {
  if (width >= SNAP_POINTS.THREE_COLUMNS - SNAP_THRESHOLD) return 3
  if (width >= SNAP_POINTS.TWO_COLUMNS - SNAP_THRESHOLD) return 2
  return 1
}

// Palette card component
interface PaletteCardProps {
  label: string
  icon: React.ReactNode
  description: string
  onDragStart: (e: React.DragEvent) => void
}

function PaletteCard({ label, icon, description, onDragStart }: PaletteCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{ width: CARD_WIDTH }}
      className={cn(
        'p-3 bg-background border rounded-lg cursor-grab',
        'hover:border-primary hover:shadow-sm transition-all',
        'flex flex-col items-center text-center'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-primary flex-shrink-0">{icon}</span>
      </div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  )
}

const stepTypes: PaletteItem[] = [
  {
    type: 'action',
    label: 'Action',
    icon: <Play className="w-4 h-4" />,
    description: 'Executes a command',
  },
  {
    type: 'decision',
    label: 'Decision',
    icon: <GitBranch className="w-4 h-4" />,
    description: 'Routes via conditions',
  },
  {
    type: 'wait',
    label: 'Wait',
    icon: <Clock className="w-4 h-4" />,
    description: 'Pauses until event/timeout',
  },
  {
    type: 'subprocess',
    label: 'Subprocess',
    icon: <Layers className="w-4 h-4" />,
    description: 'Invokes another plan',
  },
  {
    type: 'join',
    label: 'Join',
    icon: <Merge className="w-4 h-4" />,
    description: 'Waits for parallel tokens',
  },
  {
    type: 'terminal',
    label: 'Terminal',
    icon: <Flag className="w-4 h-4" />,
    description: 'End state',
  },
]

export function Palette() {
  const [searchQuery, setSearchQuery] = useState('')
  const [paletteWidth, setPaletteWidth] = useState(SNAP_POINTS.ONE_COLUMN)
  const [isDragging, setIsDragging] = useState(false)
  const paletteRef = useRef<HTMLDivElement>(null)
  const commandTypes = useWorkflowStore((state) => state.commandTypes)
  const collapsed = useWorkflowStore((state) => state.paletteCollapsed)
  const setCollapsed = useWorkflowStore((state) => state.setPaletteCollapsed)

  const columnCount = getColumnCount(paletteWidth)

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!paletteRef.current) return
      const paletteLeft = paletteRef.current.getBoundingClientRect().left
      const newWidth = e.clientX - paletteLeft
      // Allow free dragging between min and max
      const clampedWidth = Math.max(SNAP_POINTS.ONE_COLUMN - 20, Math.min(SNAP_POINTS.THREE_COLUMNS + 20, newWidth))
      setPaletteWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Snap to nearest snap point on release
      setPaletteWidth((current) => getSnapPoint(current))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  const onDragStart = useCallback(
    (
      event: React.DragEvent,
      nodeType: StepType,
      commandTypeId?: string
    ) => {
      event.dataTransfer.setData('application/reactflow/type', nodeType)
      if (commandTypeId) {
        event.dataTransfer.setData('application/reactflow/commandTypeId', commandTypeId)
      }
      event.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  // Group command types by category
  const commandTypesByCategory = commandTypes
    .filter((ct) => ct.ui_metadata.palette_visible && ct.status === 'active')
    .reduce<Record<string, CommandType[]>>((acc, ct) => {
      const category = ct.ui_metadata.category || 'Other'
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(ct)
      return acc
    }, {})

  const filteredStepTypes = stepTypes.filter(
    (item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredCommandTypes = Object.entries(commandTypesByCategory).reduce<
    Record<string, CommandType[]>
  >((acc, [category, types]) => {
    const filtered = types.filter(
      (ct) =>
        ct.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ct.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    if (filtered.length > 0) {
      acc[category] = filtered
    }
    return acc
  }, {})

  if (collapsed) {
    return (
      <div className="w-12 bg-muted border-r flex flex-col items-center py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 hover:bg-accent rounded-md"
          aria-label="Expand palette"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-4 flex flex-col gap-2">
          {stepTypes.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              className="p-2 bg-background border rounded cursor-grab hover:border-primary transition-colors"
              title={item.label}
            >
              {item.icon}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={paletteRef}
      className="bg-muted flex flex-col relative"
      style={{ width: paletteWidth }}
    >
      {/* Header - h-14 matches main header */}
      <div className="h-14 flex items-center justify-between px-3 border-b flex-shrink-0">
        <span className="font-semibold text-sm">Components</span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 hover:bg-accent rounded"
          aria-label="Collapse palette"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Step Types Section */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Step Types
          </h3>
          <div
            className="grid gap-2 justify-center"
            style={{ gridTemplateColumns: `repeat(${columnCount}, ${CARD_WIDTH}px)` }}
          >
            {filteredStepTypes.map((item) => (
              <PaletteCard
                key={item.type}
                label={item.label}
                icon={item.icon}
                description={item.description}
                onDragStart={(e) => onDragStart(e, item.type)}
              />
            ))}
          </div>
        </div>

        {/* Command Types Section */}
        {Object.keys(filteredCommandTypes).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Commands
            </h3>
            {Object.entries(filteredCommandTypes).map(([category, types]) => (
              <div key={category} className="mb-3">
                <h4 className="text-xs font-medium text-muted-foreground mb-1">
                  {category}
                </h4>
                <div
                  className="grid gap-2 justify-center"
                  style={{ gridTemplateColumns: `repeat(${columnCount}, ${CARD_WIDTH}px)` }}
                >
                  {types.map((ct) => (
                    <PaletteCard
                      key={ct.id}
                      label={ct.name}
                      icon={ct.ui_metadata.icon || <Play className="w-4 h-4" />}
                      description={ct.description}
                      onDragStart={(e) => onDragStart(e, 'action', ct.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          'absolute top-0 right-0 w-2 h-full cursor-col-resize z-10',
          'bg-border hover:bg-primary/50 transition-colors',
          'flex items-center justify-center',
          isDragging && 'bg-primary'
        )}
      >
        <div className="w-0.5 h-8 bg-muted-foreground/30 rounded-full" />
      </div>
    </div>
  )
}
