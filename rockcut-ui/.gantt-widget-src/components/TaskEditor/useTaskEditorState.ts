import { useState, useCallback, useMemo } from 'react';
import type { TaskModel, TaskData } from '../../models/TaskModel';
import type { DependencyType } from '../../models/types';
import { validateTaskDraft, type ValidationErrors, hasErrors } from './validation';

export type TabId = 'general' | 'predecessors' | 'resources' | 'notes' | 'constraint';

export interface DependencyChange {
  type: 'add' | 'remove';
  dependencyId?: string;
  fromTaskId?: string;
  dependencyType?: DependencyType;
  lag?: number;
}

export interface AssignmentChange {
  type: 'add' | 'remove' | 'update';
  assignmentId?: string;
  resourceId?: string;
  units?: number;
}

export interface TaskEditorState {
  draft: Partial<TaskData>;
  activeTab: TabId;
  errors: ValidationErrors;
  isDirty: boolean;
  pendingDependencyChanges: DependencyChange[];
  pendingAssignmentChanges: AssignmentChange[];
}

export function useTaskEditorState(task: TaskModel) {
  const [draft, setDraft] = useState<Partial<TaskData>>(() => ({
    name: task.name,
    startDate: task.startDate,
    endDate: task.endDate,
    duration: task.duration,
    percentDone: task.percentDone,
    milestone: task.milestone,
    manuallyScheduled: task.manuallyScheduled,
    constraintType: task.constraintType,
    constraintDate: task.constraintDate,
    notes: task.notes,
  }));

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [isDirty, setIsDirty] = useState(false);
  const [pendingDependencyChanges, setPendingDependencyChanges] = useState<DependencyChange[]>([]);
  const [pendingAssignmentChanges, setPendingAssignmentChanges] = useState<AssignmentChange[]>([]);

  const errors = useMemo(() => validateTaskDraft(draft), [draft]);

  const updateDraft = useCallback((changes: Partial<TaskData>) => {
    setDraft(prev => ({ ...prev, ...changes }));
    setIsDirty(true);
  }, []);

  const addPredecessorChange = useCallback((fromTaskId: string, type: DependencyType, lag: number) => {
    setPendingDependencyChanges(prev => [
      ...prev,
      { type: 'add', fromTaskId, dependencyType: type, lag },
    ]);
    setIsDirty(true);
  }, []);

  const removePredecessorChange = useCallback((dependencyId: string) => {
    setPendingDependencyChanges(prev => [
      ...prev,
      { type: 'remove', dependencyId },
    ]);
    setIsDirty(true);
  }, []);

  const addAssignmentChange = useCallback((resourceId: string, units: number) => {
    setPendingAssignmentChanges(prev => [
      ...prev,
      { type: 'add', resourceId, units },
    ]);
    setIsDirty(true);
  }, []);

  const removeAssignmentChange = useCallback((assignmentId: string) => {
    setPendingAssignmentChanges(prev => [
      ...prev,
      { type: 'remove', assignmentId },
    ]);
    setIsDirty(true);
  }, []);

  const updateAssignmentUnitsChange = useCallback((assignmentId: string, units: number) => {
    setPendingAssignmentChanges(prev => [
      ...prev,
      { type: 'update', assignmentId, units },
    ]);
    setIsDirty(true);
  }, []);

  const canSave = !hasErrors(errors);

  const reset = useCallback(() => {
    setDraft({
      name: task.name,
      startDate: task.startDate,
      endDate: task.endDate,
      duration: task.duration,
      percentDone: task.percentDone,
      milestone: task.milestone,
      manuallyScheduled: task.manuallyScheduled,
      constraintType: task.constraintType,
      constraintDate: task.constraintDate,
      notes: task.notes,
    });
    setPendingDependencyChanges([]);
    setPendingAssignmentChanges([]);
    setIsDirty(false);
    setActiveTab('general');
  }, [task]);

  return {
    draft,
    activeTab,
    setActiveTab,
    errors,
    isDirty,
    canSave,
    updateDraft,
    pendingDependencyChanges,
    pendingAssignmentChanges,
    addPredecessorChange,
    removePredecessorChange,
    addAssignmentChange,
    removeAssignmentChange,
    updateAssignmentUnitsChange,
    reset,
  };
}
