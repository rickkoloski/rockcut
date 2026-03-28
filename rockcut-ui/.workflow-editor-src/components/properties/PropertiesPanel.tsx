import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useWorkflowStore } from '@wf/stores'
import type { ParameterSchema } from '@wf/types'

export function PropertiesPanel() {
  const selectedNode = useWorkflowStore((state) => state.getSelectedNode())
  const updateNode = useWorkflowStore((state) => state.updateNode)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['basic', 'parameters'])
  )

  if (!selectedNode) {
    return null
  }

  const { step, command, commandType } = selectedNode.data

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const handleNameChange = (name: string) => {
    updateNode(selectedNode.id, {
      step: { ...step, name },
    })
  }

  const handleDescriptionChange = (description: string) => {
    updateNode(selectedNode.id, {
      step: { ...step, description },
    })
  }

  const handleParameterChange = (key: string, value: unknown) => {
    if (!command) return
    updateNode(selectedNode.id, {
      command: {
        ...command,
        parameters: { ...command.parameters, [key]: value },
      },
    })
  }

  const renderParameterInput = (
    key: string,
    schema: ParameterSchema,
    value: unknown
  ) => {
    const inputId = `param-${key}`

    switch (schema.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={inputId}
              checked={Boolean(value)}
              onChange={(e) => handleParameterChange(key, e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor={inputId} className="text-sm">
              {key}
            </label>
          </div>
        )

      case 'number':
        return (
          <div>
            <label htmlFor={inputId} className="text-xs text-muted-foreground">
              {key}
              {schema.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="number"
              id={inputId}
              value={value as number ?? schema.default ?? ''}
              onChange={(e) =>
                handleParameterChange(key, parseFloat(e.target.value))
              }
              className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )

      case 'string':
        if (schema.enum) {
          return (
            <div>
              <label htmlFor={inputId} className="text-xs text-muted-foreground">
                {key}
                {schema.required && <span className="text-red-500">*</span>}
              </label>
              <select
                id={inputId}
                value={value as string ?? schema.default ?? ''}
                onChange={(e) => handleParameterChange(key, e.target.value)}
                className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select...</option>
                {schema.enum.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )
        }
        return (
          <div>
            <label htmlFor={inputId} className="text-xs text-muted-foreground">
              {key}
              {schema.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              id={inputId}
              value={value as string ?? schema.default ?? ''}
              onChange={(e) => handleParameterChange(key, e.target.value)}
              className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )

      default:
        return (
          <div>
            <label htmlFor={inputId} className="text-xs text-muted-foreground">
              {key} (JSON)
            </label>
            <textarea
              id={inputId}
              value={JSON.stringify(value ?? schema.default ?? null, null, 2)}
              onChange={(e) => {
                try {
                  handleParameterChange(key, JSON.parse(e.target.value))
                } catch {
                  // Invalid JSON, ignore
                }
              }}
              rows={3}
              className="w-full mt-1 px-2 py-1.5 text-sm font-mono bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
                  htmlFor="node-name"
                  className="text-xs text-muted-foreground"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="node-name"
                  value={step.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label
                  htmlFor="node-description"
                  className="text-xs text-muted-foreground"
                >
                  Description
                </label>
                <textarea
                  id="node-description"
                  value={step.description || ''}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-2 py-1.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Type</span>
                <div className="mt-1 px-2 py-1.5 text-sm bg-background border rounded-md text-muted-foreground">
                  {step.step_type}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Parameters Section (for action nodes with commands) */}
        {commandType && command && (
          <div className="border-b">
            <button
              onClick={() => toggleSection('parameters')}
              className="flex items-center justify-between w-full p-3 hover:bg-accent/50"
            >
              <span className="text-sm font-medium">Parameters</span>
              {expandedSections.has('parameters') ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            {expandedSections.has('parameters') && (
              <div className="px-3 pb-3 space-y-3">
                {Object.keys(commandType.parameter_schema).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No parameters required
                  </p>
                ) : (
                  Object.entries(commandType.parameter_schema).map(
                    ([key, schema]) => (
                      <div key={key}>
                        {renderParameterInput(
                          key,
                          schema,
                          command.parameters[key]
                        )}
                        {schema.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {schema.description}
                          </p>
                        )}
                      </div>
                    )
                  )
                )}
              </div>
            )}
          </div>
        )}

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
                    id: selectedNode.id,
                    type: selectedNode.type,
                    position: selectedNode.position,
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
