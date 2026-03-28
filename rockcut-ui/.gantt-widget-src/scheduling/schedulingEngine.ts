import { TaskStore } from '../stores/TaskStore';
import { DependencyStore } from '../stores/DependencyStore';
import { TaskModel } from '../models';
import { isSameDay } from '../utils/dateUtils';
import {
  forwardPass,
  validateAllDependencies,
  validateDependency,
} from './dependencyScheduler';
import type { ScheduledDates, DependencyViolation } from './dependencyScheduler';
import { getTransitiveSuccessors } from './topologicalSort';
import { CriticalPathAnalyzer } from './criticalPathAnalyzer';
import type { CPMResult } from './criticalPath';

export interface TaskDateChange {
  taskId: string;
  oldStartDate: Date;
  oldEndDate: Date;
  newStartDate: Date;
  newEndDate: Date;
}

export interface PropagationResult {
  changes: TaskDateChange[];
  errors: string[];
}

export interface SchedulingEngineOptions {
  taskStore: TaskStore;
  dependencyStore: DependencyStore;
  autoSchedule?: boolean;
}

export class SchedulingEngine {
  private taskStore: TaskStore;
  private dependencyStore: DependencyStore;
  private autoSchedule: boolean;
  private cpmAnalyzer: CriticalPathAnalyzer;

  constructor(options: SchedulingEngineOptions) {
    this.taskStore = options.taskStore;
    this.dependencyStore = options.dependencyStore;
    this.autoSchedule = options.autoSchedule ?? true;
    this.cpmAnalyzer = new CriticalPathAnalyzer({
      taskStore: this.taskStore,
      dependencyStore: this.dependencyStore,
    });
  }

  /**
   * Schedule all tasks from scratch using forward pass.
   */
  scheduleAll(): PropagationResult {
    const tasks = this.taskStore.getAll().filter(t => t.isLeaf);
    const dependencies = this.dependencyStore.getAll();
    const taskLookup = new Map(this.taskStore.getAll().map(t => [t.id, t]));

    const result = forwardPass(tasks, dependencies, taskLookup);

    const changes: TaskDateChange[] = [];

    // Apply changes to store
    for (const [taskId, dates] of result.scheduledDates) {
      const task = this.taskStore.getById(taskId);
      if (!task?.startDate || !task?.endDate) continue;

      // Only update if dates actually changed
      if (!isSameDay(task.startDate, dates.startDate) ||
          !isSameDay(task.endDate, dates.endDate)) {
        const oldStart = task.startDate;
        const oldEnd = task.endDate;

        this.taskStore.update(taskId, {
          startDate: dates.startDate,
          endDate: dates.endDate,
        });

        changes.push({
          taskId,
          oldStartDate: oldStart,
          oldEndDate: oldEnd,
          newStartDate: dates.startDate,
          newEndDate: dates.endDate,
        });
      }
    }

    // Recalculate summary tasks
    if (changes.length > 0) {
      this.taskStore.recalculateAllSummaries();
    }

    // Invalidate CPM cache
    this.cpmAnalyzer.invalidate();

    return { changes, errors: result.errors };
  }

  /**
   * Propagate date changes from a specific task to its successors.
   */
  propagateFrom(taskId: string): PropagationResult {
    if (!this.autoSchedule) {
      return { changes: [], errors: [] };
    }

    const dependencies = this.dependencyStore.getAll();

    // Get all successors that need to be rescheduled
    const affectedIds = getTransitiveSuccessors(taskId, dependencies);

    if (affectedIds.length === 0) {
      return { changes: [], errors: [] };
    }

    // Get the tasks to reschedule
    const affectedTasks = affectedIds
      .map(id => this.taskStore.getById(id))
      .filter((t): t is TaskModel => t !== null && t.isLeaf);

    // Also include the changed task in the lookup
    const allTasks = this.taskStore.getAll();
    const taskLookup = new Map(allTasks.map(t => [t.id, t]));

    // Run forward pass on affected tasks
    const result = forwardPass(affectedTasks, dependencies, taskLookup);

    const changes: TaskDateChange[] = [];

    // Apply changes to store
    for (const [affectedId, dates] of result.scheduledDates) {
      const task = this.taskStore.getById(affectedId);
      if (!task?.startDate || !task?.endDate) continue;

      // Only update if dates actually changed
      if (!isSameDay(task.startDate, dates.startDate) ||
          !isSameDay(task.endDate, dates.endDate)) {
        const oldStart = task.startDate;
        const oldEnd = task.endDate;

        this.taskStore.update(affectedId, {
          startDate: dates.startDate,
          endDate: dates.endDate,
        });

        changes.push({
          taskId: affectedId,
          oldStartDate: oldStart,
          oldEndDate: oldEnd,
          newStartDate: dates.startDate,
          newEndDate: dates.endDate,
        });
      }
    }

    // Recalculate summary tasks
    if (changes.length > 0) {
      this.taskStore.recalculateAllSummaries();
    }

    // Invalidate CPM cache
    this.cpmAnalyzer.invalidate();

    return { changes, errors: result.errors };
  }

  /**
   * Validate all dependency constraints.
   */
  validateDependencies(): DependencyViolation[] {
    const tasks = this.taskStore.getAll();
    const dependencies = this.dependencyStore.getAll();
    return validateAllDependencies(tasks, dependencies);
  }

  /**
   * Check if a proposed date change is valid (doesn't violate predecessors).
   */
  canMoveTo(
    taskId: string,
    proposedStart: Date,
    proposedEnd: Date
  ): { valid: boolean; violations: DependencyViolation[] } {
    const violations: DependencyViolation[] = [];
    const task = this.taskStore.getById(taskId);
    if (!task) {
      return { valid: true, violations: [] };
    }

    // Check all incoming dependencies (predecessors)
    const incomingDeps = this.dependencyStore.getDependenciesTo(taskId);

    for (const dep of incomingDeps) {
      if (!dep.active) continue;

      const pred = this.taskStore.getById(dep.fromTask);
      if (!pred?.startDate || !pred?.endDate) continue;

      const violation = validateDependency(
        dep,
        { startDate: pred.startDate, endDate: pred.endDate },
        { startDate: proposedStart, endDate: proposedEnd }
      );

      if (violation) {
        violations.push(violation);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Enable or disable auto-scheduling.
   */
  setAutoSchedule(enabled: boolean): void {
    this.autoSchedule = enabled;
  }

  /**
   * Check if auto-scheduling is enabled.
   */
  isAutoScheduleEnabled(): boolean {
    return this.autoSchedule;
  }

  /**
   * Get the critical path analyzer.
   */
  getCriticalPathAnalyzer(): CriticalPathAnalyzer {
    return this.cpmAnalyzer;
  }

  /**
   * Run CPM analysis and return result.
   */
  analyzeCriticalPath(): CPMResult {
    return this.cpmAnalyzer.analyze();
  }

  /**
   * Check if a task is on the critical path.
   */
  isCritical(taskId: string): boolean {
    return this.cpmAnalyzer.isCritical(taskId);
  }
}
