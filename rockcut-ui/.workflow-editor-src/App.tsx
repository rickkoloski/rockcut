import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkflowEditor } from './components/WorkflowEditor'
import {
  DocsLayout,
  Introduction,
  Installation,
  QuickStart,
  WorkflowEditorDocs,
  DataBinding,
  Placeholder,
} from './components/docs'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main Editor */}
        <Route
          path="/"
          element={
            <div className="h-screen w-screen">
              <ReactFlowProvider>
                <WorkflowEditor />
              </ReactFlowProvider>
            </div>
          }
        />

        {/* Documentation */}
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<Introduction />} />
          <Route path="installation" element={<Installation />} />
          <Route path="quick-start" element={<QuickStart />} />
          <Route path="components/workflow-editor" element={<WorkflowEditorDocs />} />
          <Route path="components/palette" element={<Placeholder />} />
          <Route path="components/nodes" element={<Placeholder />} />
          <Route path="components/edges" element={<Placeholder />} />
          <Route path="guides/data-binding" element={<DataBinding />} />
          <Route path="guides/customization" element={<Placeholder />} />
          <Route path="guides/state-management" element={<Placeholder />} />
          <Route path="*" element={<Placeholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
