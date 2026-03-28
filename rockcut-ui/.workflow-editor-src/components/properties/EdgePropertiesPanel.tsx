import { useState } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { useWorkflowStore } from '@wf/stores'
import type { EdgePathType } from '@wf/types'

export function EdgePropertiesPanel() {
  const selectedEdge = useWorkflowStore((state) => state.getSelectedEdge())
  const updateEdge = useWorkflowStore((state) => state.updateEdge)
  const selectEdge = useWorkflowStore((state) => state.selectEdge)
  const defaultEdgePathType = useWorkflowStore((state) => state.defaultEdgePathType)
  const setDefaultEdgePathType = useWorkflowStore((state) => state.setDefaultEdgePathType)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['basic', 'appearance'])
  )

  if (!selectedEdge) {
    return null
  }

  const { transition, condition, label, pathType } = selectedEdge.data || {}

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const handleLabelChange = (newLabel: string) => {
    updateEdge(selectedEdge.id, {
      label: newLabel,
    })
  }

  const handlePathTypeChange = (newPathType: EdgePathType) => {
    updateEdge(selectedEdge.id, {
      pathType: newPathType,
    })
  }

  const handleUseAsDefault = () => {
    const currentPathType = pathType || defaultEdgePathType
    setDefaultEdgePathType(currentPathType)
  }

  const currentPathType = pathType || defaultEdgePathType

  return (
    <div className="w-72 bg-muted border-l flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <span className="font-semibold text-sm">Edge Properties</span>
        <button
          onClick={() => selectEdge(null)}
          className="p-1 hover:bg-accent rounded"
          aria-label="Close properties"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Basic Info Section */}
        <div className="border-b">
          <button
            onClick={() => toggleSection('basic')}
            className="flex items-center justify-between w-full p-3 hover:bg-accent/50"
          >
            <span className="text-sm font-medium">Basic Info</span>
            {expandedSections.has('basic') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {expandedSections.has('basic') && (
            <div className="px-3 pb-3 space-y-3">
              <div>
                <label
                  htmlFor="edge-label"
                  className="text-xs text-muted-foreground"
                >
                  Label
                </label>
                <input
                  type="text"
                  id="edge-label"
                  value={label || ''}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Enter edge label..."
                  className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {transition && (
                <div>
                  <span className="text-xs text-muted-foreground">Transition Type</span>
                  <div className="mt-1 px-2 py-1.5 text-sm bg-background border rounded-md text-muted-foreground">
                    {transition.transition_type}
                  </div>
                </div>
              )}
              {condition && (
                <div>
                  <span className="text-xs text-muted-foreground">Condition</span>
                  <div className="mt-1 px-2 py-1.5 text-sm bg-background border rounded-md text-muted-foreground">
                    {condition.name}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Appearance Section */}
        <div className="border-b">
          <button
            onClick={() => toggleSection('appearance')}
            className="flex items-center justify-between w-full p-3 hover:bg-accent/50"
          >
            <span className="text-sm font-medium">Appearance</span>
            {expandedSections.has('appearance') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {expandedSections.has('appearance') && (
            <div className="px-3 pb-3 space-y-3">
              <div>
                <label
                  htmlFor="edge-path-type"
                  className="text-xs text-muted-foreground"
                >
                  Line Style
                </label>
                <select
                  id="edge-path-type"
                  value={currentPathType}
                  onChange={(e) => handlePathTypeChange(e.target.value as EdgePathType)}
                  className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="bezier">Curved (Bezier)</option>
                  <option value="smoothstep">Orthogonal (Step)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use-as-default"
                  checked={currentPathType === defaultEdgePathType}
                  onChange={handleUseAsDefault}
                  className="w-4 h-4 rounded border-border"
                />
                <label htmlFor="use-as-default" className="text-sm">
                  Use as default for new edges
                </label>
              </div>
              {currentPathType === defaultEdgePathType && (
                <p className="text-xs text-muted-foreground">
                  This style will be applied to new edges.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div>
          <button
            onClick={() => toggleSection('debug')}
            className="flex items-center justify-between w-full p-3 hover:bg-accent/50"
          >
            <span className="text-sm font-medium">Debug Info</span>
            {expandedSections.has('debug') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          {expandedSections.has('debug') && (
            <div className="px-3 pb-3">
              <pre className="text-xs bg-background border rounded-md p-2 overflow-auto max-h-40">
                {JSON.stringify(
                  {
                    id: selectedEdge.id,
                    source: selectedEdge.source,
                    target: selectedEdge.target,
                    type: selectedEdge.type,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
