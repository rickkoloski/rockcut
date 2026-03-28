import React, { useState } from 'react';
import { Button, Select } from '../common';
import type { TaskStore } from '../../stores/TaskStore';
import type { DependencyStore } from '../../stores/DependencyStore';
import { DependencyType } from '../../models/types';

export interface PredecessorsTabProps {
  taskId: string;
  taskStore: TaskStore;
  dependencyStore: DependencyStore;
  onAddPredecessor: (fromTaskId: string, type: DependencyType, lag: number) => void;
  onRemovePredecessor: (dependencyId: string) => void;
}

const DEPENDENCY_TYPE_OPTIONS = [
  { value: String(DependencyType.FinishToStart), label: 'Finish to Start (FS)' },
  { value: String(DependencyType.StartToStart), label: 'Start to Start (SS)' },
  { value: String(DependencyType.FinishToFinish), label: 'Finish to Finish (FF)' },
  { value: String(DependencyType.StartToFinish), label: 'Start to Finish (SF)' },
];

const DEPENDENCY_TYPE_LABELS: Record<number, string> = {
  [DependencyType.FinishToStart]: 'FS',
  [DependencyType.StartToStart]: 'SS',
  [DependencyType.FinishToFinish]: 'FF',
  [DependencyType.StartToFinish]: 'SF',
};

export function PredecessorsTab({
  taskId,
  taskStore,
  dependencyStore,
  onAddPredecessor,
  onRemovePredecessor,
}: PredecessorsTabProps) {
  const [newPredecessorId, setNewPredecessorId] = useState('');
  const [newType, setNewType] = useState(String(DependencyType.FinishToStart));
  const [newLag, setNewLag] = useState(0);

  // Get incoming dependencies (predecessors)
  const predecessorDeps = dependencyStore.getAll().filter(d => d.toTask === taskId);

  // Get available tasks for selection (exclude self and current predecessors)
  const predecessorIds = new Set(predecessorDeps.map(d => d.fromTask));
  const availableTasks = taskStore.getAll().filter(t =>
    t.id !== taskId && !predecessorIds.has(t.id) && t.isLeaf
  );

  const handleAdd = () => {
    if (newPredecessorId) {
      onAddPredecessor(newPredecessorId, parseInt(newType) as DependencyType, newLag);
      setNewPredecessorId('');
      setNewLag(0);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Predecessors
      </h3>

      {/* Predecessor list */}
      {predecessorDeps.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2">#</th>
              <th className="pb-2">Task</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Lag</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {predecessorDeps.map((dep, index) => {
              const predTask = taskStore.getById(dep.fromTask);
              return (
                <tr key={dep.id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-2 text-gray-500">{index + 1}</td>
                  <td className="py-2">{predTask?.name || 'Unknown'}</td>
                  <td className="py-2">{DEPENDENCY_TYPE_LABELS[dep.type]}</td>
                  <td className="py-2">{dep.lag > 0 ? `+${dep.lag}d` : dep.lag < 0 ? `${dep.lag}d` : '0d'}</td>
                  <td className="py-2">
                    <button
                      onClick={() => onRemovePredecessor(dep.id)}
                      className="text-red-500 hover:text-red-700"
                      title="Remove predecessor"
                      data-testid={`remove-predecessor-${dep.id}`}
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
        <p className="text-sm text-gray-500 dark:text-gray-400">No predecessors</p>
      )}

      {/* Add predecessor form */}
      {availableTasks.length > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Add Predecessor
          </h4>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Select
                label="Task"
                value={newPredecessorId}
                onChange={e => setNewPredecessorId(e.target.value)}
                options={[
                  { value: '', label: 'Select task...' },
                  ...availableTasks.map(t => ({ value: t.id, label: t.name })),
                ]}
                data-testid="select-predecessor-task"
              />
            </div>
            <div className="w-40">
              <Select
                label="Type"
                value={newType}
                onChange={e => setNewType(e.target.value)}
                options={DEPENDENCY_TYPE_OPTIONS}
                data-testid="select-predecessor-type"
              />
            </div>
            <div className="w-24">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Lag
              </label>
              <input
                type="number"
                value={newLag}
                onChange={e => setNewLag(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600"
                data-testid="input-predecessor-lag"
              />
            </div>
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={!newPredecessorId}
              data-testid="add-predecessor-button"
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
