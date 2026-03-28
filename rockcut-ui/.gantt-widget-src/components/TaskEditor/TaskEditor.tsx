import React, { useEffect } from 'react';
import { Modal, Button } from '../common';
import { TabPanel, type Tab } from './TabPanel';
import { GeneralTab } from './GeneralTab';
import { PredecessorsTab } from './PredecessorsTab';
import { ResourcesTab } from './ResourcesTab';
import { NotesTab } from './NotesTab';
import { ConstraintTab } from './ConstraintTab';
import { useTaskEditorState, type TabId } from './useTaskEditorState';
import type { TaskModel } from '../../models/TaskModel';
import type { TaskStore } from '../../stores/TaskStore';
import type { DependencyStore } from '../../stores/DependencyStore';
import type { ResourceStore } from '../../stores/ResourceStore';
import type { AssignmentStore } from '../../stores/AssignmentStore';
import { DependencyModel } from '../../models/DependencyModel';

export interface TaskEditorProps {
  task: TaskModel;
  taskStore: TaskStore;
  dependencyStore: DependencyStore;
  resourceStore?: ResourceStore;
  assignmentStore?: AssignmentStore;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (updatedTask: TaskModel) => void;
}

export function TaskEditor({
  task,
  taskStore,
  dependencyStore,
  resourceStore,
  assignmentStore,
  isOpen,
  onClose,
  onSave,
}: TaskEditorProps) {
  const state = useTaskEditorState(task);

  // Reset state when task changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      state.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task.id]);

  const handleSave = () => {
    if (!state.canSave) return;

    // Update task
    taskStore.update(task.id, state.draft);

    // Apply dependency changes
    for (const change of state.pendingDependencyChanges) {
      if (change.type === 'add' && change.fromTaskId && change.dependencyType !== undefined) {
        const dep = DependencyModel.create({
          fromTask: change.fromTaskId,
          toTask: task.id,
          type: change.dependencyType,
          lag: change.lag || 0,
        });
        dependencyStore.add(dep);
      } else if (change.type === 'remove' && change.dependencyId) {
        dependencyStore.remove(change.dependencyId);
      }
    }

    // Apply assignment changes
    if (assignmentStore) {
      for (const change of state.pendingAssignmentChanges) {
        if (change.type === 'add' && change.resourceId) {
          assignmentStore.assign(task.id, change.resourceId, change.units || 100);
        } else if (change.type === 'remove' && change.assignmentId) {
          const assignment = assignmentStore.getAll().find(a => a.id === change.assignmentId);
          if (assignment) {
            assignmentStore.unassign(assignment.taskId, assignment.resourceId);
          }
        } else if (change.type === 'update' && change.assignmentId && change.units !== undefined) {
          assignmentStore.updateUnits(change.assignmentId, change.units);
        }
      }
    }

    // Notify parent
    const updatedTask = taskStore.getById(task.id);
    if (updatedTask && onSave) {
      onSave(updatedTask);
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // Build tabs
  const tabs: Tab[] = [
    {
      id: 'general',
      label: 'General',
      content: (
        <GeneralTab
          draft={state.draft}
          onChange={state.updateDraft}
          errors={state.errors}
        />
      ),
    },
    {
      id: 'predecessors',
      label: 'Predecessors',
      content: (
        <PredecessorsTab
          taskId={task.id}
          taskStore={taskStore}
          dependencyStore={dependencyStore}
          onAddPredecessor={state.addPredecessorChange}
          onRemovePredecessor={state.removePredecessorChange}
        />
      ),
    },
  ];

  // Add Resources tab if stores are provided
  if (resourceStore && assignmentStore) {
    tabs.push({
      id: 'resources',
      label: 'Resources',
      content: (
        <ResourcesTab
          taskId={task.id}
          resourceStore={resourceStore}
          assignmentStore={assignmentStore}
          onAddAssignment={state.addAssignmentChange}
          onRemoveAssignment={state.removeAssignmentChange}
          onUpdateUnits={state.updateAssignmentUnitsChange}
        />
      ),
    });
  }

  tabs.push(
    {
      id: 'notes',
      label: 'Notes',
      content: (
        <NotesTab
          notes={state.draft.notes || ''}
          onChange={notes => state.updateDraft({ notes })}
        />
      ),
    },
    {
      id: 'constraint',
      label: 'Constraint',
      content: (
        <ConstraintTab
          constraintType={state.draft.constraintType!}
          constraintDate={state.draft.constraintDate || null}
          onChange={(type, date) => state.updateDraft({ constraintType: type, constraintDate: date })}
        />
      ),
    }
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={`Edit Task: ${task.name}`}
      width="700px"
      footer={
        <>
          <Button variant="secondary" onClick={handleCancel} data-testid="cancel-button">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!state.canSave}
            data-testid="save-button"
          >
            Save
          </Button>
        </>
      }
    >
      <TabPanel
        tabs={tabs}
        activeTab={state.activeTab}
        onTabChange={id => state.setActiveTab(id as TabId)}
      />
    </Modal>
  );
}
