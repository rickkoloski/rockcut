import { useCallback, useState } from 'react';
import type { TaskStore } from '../stores/TaskStore';
import { TaskModel } from '../models';
import type { TaskModelConfig } from '../models';

export interface AddTaskOptions {
  parentId?: string | null;
  afterId?: string;
  defaults?: Partial<TaskModelConfig>;
}

export interface DeleteTaskResult {
  success: boolean;
  confirmationRequired?: boolean;
  descendantCount?: number;
}

export interface UseTaskCrudOptions {
  taskStore: TaskStore;
  onTaskAdded?: (task: TaskModel) => void;
  onTaskDeleted?: (taskId: string) => void;
  onTaskUpdated?: (task: TaskModel) => void;
}

export function useTaskCrud({ taskStore, onTaskAdded, onTaskDeleted, onTaskUpdated }: UseTaskCrudOptions) {
  const [pendingDelete, setPendingDelete] = useState<{
    taskId: string;
    descendantCount: number;
  } | null>(null);

  const addTask = useCallback((options: AddTaskOptions = {}): TaskModel => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 5);

    const newTask = TaskModel.create({
      name: 'New Task',
      startDate: today,
      endDate: endDate,
      percentDone: 0,
      parentId: options.parentId ?? null,
      ...options.defaults,
    });

    taskStore.add(newTask);

    // Reorder if afterId specified
    if (options.afterId) {
      taskStore.reorderAfter(newTask.id, options.afterId);
    }

    // Expand parent if adding as child
    if (options.parentId) {
      taskStore.expand(options.parentId);
    }

    onTaskAdded?.(newTask);
    return newTask;
  }, [taskStore, onTaskAdded]);

  const addSubtask = useCallback((parentId: string, defaults?: Partial<TaskModelConfig>): TaskModel => {
    return addTask({ parentId, defaults });
  }, [addTask]);

  const deleteTask = useCallback((taskId: string, force = false): DeleteTaskResult => {
    const task = taskStore.getById(taskId);
    if (!task) {
      return { success: false };
    }

    const descendants = taskStore.getDescendants(taskId);

    // If has children and not forcing, require confirmation
    if (descendants.length > 0 && !force) {
      setPendingDelete({ taskId, descendantCount: descendants.length });
      return {
        success: false,
        confirmationRequired: true,
        descendantCount: descendants.length,
      };
    }

    // Delete descendants first (in reverse to handle nested children)
    [...descendants].reverse().forEach(d => taskStore.remove(d.id));

    // Delete task
    taskStore.remove(taskId);

    setPendingDelete(null);
    onTaskDeleted?.(taskId);

    return { success: true };
  }, [taskStore, onTaskDeleted]);

  const confirmDelete = useCallback(() => {
    if (pendingDelete) {
      deleteTask(pendingDelete.taskId, true);
    }
  }, [pendingDelete, deleteTask]);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const indentTask = useCallback((taskId: string): boolean => {
    const result = taskStore.indent(taskId);
    if (result) {
      const task = taskStore.getById(taskId);
      if (task) onTaskUpdated?.(task);
    }
    return result;
  }, [taskStore, onTaskUpdated]);

  const outdentTask = useCallback((taskId: string): boolean => {
    const result = taskStore.outdent(taskId);
    if (result) {
      const task = taskStore.getById(taskId);
      if (task) onTaskUpdated?.(task);
    }
    return result;
  }, [taskStore, onTaskUpdated]);

  const updateTask = useCallback((taskId: string, updates: Partial<TaskModelConfig>): void => {
    taskStore.update(taskId, updates);
    const task = taskStore.getById(taskId);
    if (task) onTaskUpdated?.(task);
  }, [taskStore, onTaskUpdated]);

  return {
    addTask,
    addSubtask,
    deleteTask,
    confirmDelete,
    cancelDelete,
    indentTask,
    outdentTask,
    updateTask,
    pendingDelete,
    canIndent: (taskId: string) => taskStore.canIndent(taskId),
    canOutdent: (taskId: string) => taskStore.canOutdent(taskId),
  };
}
