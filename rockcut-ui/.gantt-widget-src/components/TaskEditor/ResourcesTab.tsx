import React, { useState } from 'react';
import { Button, Select } from '../common';
import type { ResourceStore } from '../../stores/ResourceStore';
import type { AssignmentStore } from '../../stores/AssignmentStore';

export interface ResourcesTabProps {
  taskId: string;
  resourceStore: ResourceStore;
  assignmentStore: AssignmentStore;
  onAddAssignment: (resourceId: string, units: number) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onUpdateUnits: (assignmentId: string, units: number) => void;
}

export function ResourcesTab({
  taskId,
  resourceStore,
  assignmentStore,
  onAddAssignment,
  onRemoveAssignment,
  onUpdateUnits,
}: ResourcesTabProps) {
  const [newResourceId, setNewResourceId] = useState('');
  const [newUnits, setNewUnits] = useState(100);

  // Get assignments for this task
  const assignments = assignmentStore.getByTaskId(taskId);

  // Get available resources (not already assigned)
  const assignedResourceIds = new Set(assignments.map(a => a.resourceId));
  const availableResources = resourceStore.getAll().filter(r => !assignedResourceIds.has(r.id));

  const handleAdd = () => {
    if (newResourceId) {
      onAddAssignment(newResourceId, newUnits);
      setNewResourceId('');
      setNewUnits(100);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Assigned Resources
      </h3>

      {/* Assignment list */}
      {assignments.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2">Resource</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Units</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map(assignment => {
              const resource = resourceStore.getById(assignment.resourceId);
              return (
                <tr key={assignment.id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-2">{resource?.name || 'Unknown'}</td>
                  <td className="py-2 text-gray-500">{resource?.role || '-'}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={assignment.units}
                      onChange={e => onUpdateUnits(assignment.id, parseInt(e.target.value) || 100)}
                      className="w-16 px-2 py-1 border rounded text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                      data-testid={`units-input-${assignment.id}`}
                    />
                    <span className="ml-1 text-gray-500">%</span>
                  </td>
                  <td className="py-2">
                    <button
                      onClick={() => onRemoveAssignment(assignment.id)}
                      className="text-red-500 hover:text-red-700"
                      title="Remove assignment"
                      data-testid={`remove-assignment-${assignment.id}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">No resources assigned</p>
      )}

      {/* Add resource form */}
      {availableResources.length > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Add Resource
          </h4>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Select
                label="Resource"
                value={newResourceId}
                onChange={e => setNewResourceId(e.target.value)}
                options={[
                  { value: '', label: 'Select resource...' },
                  ...availableResources.map(r => ({
                    value: r.id,
                    label: r.role ? `${r.name} (${r.role})` : r.name,
                  })),
                ]}
                data-testid="select-resource"
              />
            </div>
            <div className="w-24">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Units
              </label>
              <div className="flex items-center">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={newUnits}
                  onChange={e => setNewUnits(parseInt(e.target.value) || 100)}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                  data-testid="input-resource-units"
                />
                <span className="ml-1 text-gray-500">%</span>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={!newResourceId}
              data-testid="add-resource-button"
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
