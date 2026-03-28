import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Controls,
  ControlButton,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import { Eye, EyeOff } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import { useWorkflowStore } from '@wf/stores'
import type { StepType } from '@wf/types'
import { ActionNode } from './nodes/ActionNode'
import { DecisionNode } from './nodes/DecisionNode'
import { WaitNode } from './nodes/WaitNode'
import { SubprocessNode } from './nodes/SubprocessNode'
import { JoinNode } from './nodes/JoinNode'
import { TerminalNode } from './nodes/TerminalNode'
import { StandardEdge } from './edges/StandardEdge'
import { ParallelForkEdge } from './edges/ParallelForkEdge'
import { DefaultEdge } from './edges/DefaultEdge'
import { ConditionalEdge } from './edges/ConditionalEdge'
import { Palette } from './palette/Palette'
import { PropertiesPanel, EdgePropertiesPanel } from './properties'
import { Toolbar, type ToolbarOrientation } from './toolbar/Toolbar'

export interface WorkflowEditorProps {
  /** Hide the built-in properties panel (for external management) */
  hidePropertiesPanel?: boolean
  /** Hide the left palette (for external management, e.g., in right panel tabs) */
  hidePalette?: boolean
}

const nodeTypes: NodeTypes = {
  action: ActionNode,
  decision: DecisionNode,
  wait: WaitNode,
  subprocess: SubprocessNode,
  join: JoinNode,
  terminal: TerminalNode,
}

const edgeTypes: EdgeTypes = {
  standard: StandardEdge,
  parallel_fork: ParallelForkEdge,
  default: DefaultEdge,
  conditional: ConditionalEdge,
}

function WorkflowEditorInner({ hidePropertiesPanel = false, hidePalette = false }: WorkflowEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  // Toolbar state
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [toolbarOrientation, setToolbarOrientation] = useState<ToolbarOrientation>('horizontal')

  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange)
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange)
  const onConnect = useWorkflowStore((state) => state.onConnect)
  const addNode = useWorkflowStore((state) => state.addNode)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const selectEdge = useWorkflowStore((state) => state.selectEdge)
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId)
  const selectedEdgeId = useWorkflowStore((state) => state.selectedEdgeId)

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      // Don't override selection when shift/meta is held (let React Flow handle multi-select)
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        return
      }
      selectNode(node.id)
    },
    [selectNode]
  )

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: { id: string }) => {
      // Don't override selection when shift/meta is held
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        return
      }
      selectEdge(edge.id)
    },
    [selectEdge]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
  }, [selectNode, selectEdge])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow/type') as StepType
      if (!type) {
        return
      }

      const commandTypeId = event.dataTransfer.getData('application/reactflow/commandTypeId') || undefined

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      addNode(type, position, commandTypeId)
    },
    [screenToFlowPosition, addNode]
  )

  return (
    <div className="flex h-full w-full">
      {/* Left Palette */}
      {!hidePalette && <Palette />}

      {/* Main Canvas */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          selectionKeyCode="Alt"
          multiSelectionKeyCode="Shift"
          defaultEdgeOptions={{
            type: 'standard',
          }}
        >
          {toolbarVisible && (
            <Panel position="top-center">
              <Toolbar
                orientation={toolbarOrientation}
                onOrientationChange={setToolbarOrientation}
              />
            </Panel>
          )}
          <Controls>
            <ControlButton
              onClick={() => setToolbarVisible((v) => !v)}
              title={toolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
              style={{ order: -1 }}
            >
              {toolbarVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </ControlButton>
          </Controls>
          <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
        </ReactFlow>
      </div>

      {/* Right Properties Panel (conditionally rendered) */}
      {!hidePropertiesPanel && selectedNodeId && <PropertiesPanel />}
      {!hidePropertiesPanel && selectedEdgeId && <EdgePropertiesPanel />}
    </div>
  )
}

export function WorkflowEditor({ hidePropertiesPanel, hidePalette }: WorkflowEditorProps = {}) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner hidePropertiesPanel={hidePropertiesPanel} hidePalette={hidePalette} />
    </ReactFlowProvider>
  )
}
