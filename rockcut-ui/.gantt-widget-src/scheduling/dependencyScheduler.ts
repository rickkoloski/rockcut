import { TaskModel, DependencyModel, DependencyType } from '../models';
import type { DurationUnit } from '../models/types';
import { addDays, differenceInDays } from '../utils/dateUtils';
import { applyConstraint } from './constraintValidator';
import { topologicalSort } from './topologicalSort';

export interface ScheduledDates {
  startDate: Date;
  endDate: Date;
}

export interface SchedulingResult {
  scheduledDates: Map<string, ScheduledDates>;
  errors: string[];
}

export interface DependencyViolation {
  dependencyId: string;
  type: 'predecessor_violation' | 'successor_violation';
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  expectedDate: Date;
  actualDate: Date;
  message: string;
}

/**
 * Convert lag to days based on unit
 */
export function convertLagToDays(lag: number, unit: DurationUnit): number {
  switch (unit) {
    case 'hour':
      return lag / 24;
    case 'day':
      return lag;
    case 'week':
      return lag * 7;
    case 'month':
      return lag * 30; // Approximate
    default:
      return lag;
  }
}

/**
 * Calculate the constrained date for a successor based on a dependency.
 */
export function calculateDependencyDate(
  dependency: DependencyModel,
  predecessorDates: ScheduledDates,
  successorDuration: number
): ScheduledDates {
  const lagDays = convertLagToDays(dependency.lag, dependency.lagUnit);

  switch (dependency.type) {
    case DependencyType.FinishToStart: {
      // Successor starts after predecessor finishes + lag
      const startDate = addDays(predecessorDates.endDate, lagDays);
      return {
        startDate,
        endDate: addDays(startDate, successorDuration),
      };
    }

    case DependencyType.StartToStart: {
      // Successor starts when predecessor starts + lag
      const startDate = addDays(predecessorDates.startDate, lagDays);
      return {
        startDate,
        endDate: addDays(startDate, successorDuration),
      };
    }

    case DependencyType.FinishToFinish: {
      // Successor finishes when predecessor finishes + lag
      const endDate = addDays(predecessorDates.endDate, lagDays);
      return {
        startDate: addDays(endDate, -successorDuration),
        endDate,
      };
    }

    case DependencyType.StartToEnd: {
      // Successor finishes when predecessor starts + lag
      const endDate = addDays(predecessorDates.startDate, lagDays);
      return {
        startDate: addDays(endDate, -successorDuration),
        endDate,
      };
    }

    default:
      // Default to FS behavior
      const defaultStart = addDays(predecessorDates.endDate, lagDays);
      return {
        startDate: defaultStart,
        endDate: addDays(defaultStart, successorDuration),
      };
  }
}

/**
 * Run forward pass scheduling (ASAP).
 * Calculates earliest possible dates for all tasks respecting dependencies.
 */
export function forwardPass(
  tasks: TaskModel[],
  dependencies: DependencyModel[],
  taskLookup: Map<string, TaskModel>
): SchedulingResult {
  const errors: string[] = [];
  const scheduledDates = new Map<string, ScheduledDates>();

  // Get sorted task order
  let sortedIds: string[];
  try {
    sortedIds = topologicalSort(tasks, dependencies);
  } catch (e) {
    return {
      scheduledDates,
      errors: [(e as Error).message],
    };
  }

  // Process each task in topological order
  for (const taskId of sortedIds) {
    const task = taskLookup.get(taskId);
    if (!task) continue;

    // Skip tasks without dates
    if (!task.startDate || !task.endDate) {
      continue;
    }

    // Skip summary tasks (they get dates from children)
    if (task.isParent) {
      continue;
    }

    // Get incoming dependencies
    const incomingDeps = dependencies.filter(
      d => d.toTask === taskId && d.active
    );

    if (incomingDeps.length === 0) {
      // No predecessors - keep original dates (respecting constraints)
      const constrained = applyConstraint(
        task,
        task.startDate,
        task.endDate
      );
      scheduledDates.set(taskId, {
        startDate: constrained.startDate,
        endDate: constrained.endDate,
      });
      continue;
    }

    // Calculate earliest start based on all predecessors
    let earliestStart: Date | null = null;
    let earliestEnd: Date | null = null;

    for (const dep of incomingDeps) {
      // Get predecessor dates (either already scheduled or from task)
      let predDates = scheduledDates.get(dep.fromTask);
      if (!predDates) {
        const predTask = taskLookup.get(dep.fromTask);
        if (predTask?.startDate && predTask?.endDate) {
          predDates = {
            startDate: predTask.startDate,
            endDate: predTask.endDate,
          };
        }
      }

      if (!predDates) continue;

      const constrainedByDep = calculateDependencyDate(
        dep,
        predDates,
        task.duration
      );

      // Take the latest (most constrained) start date
      if (earliestStart === null || constrainedByDep.startDate > earliestStart) {
        earliestStart = constrainedByDep.startDate;
        earliestEnd = constrainedByDep.endDate;
      }
    }

    if (earliestStart && earliestEnd) {
      // Apply task constraints
      const constrained = applyConstraint(task, earliestStart, earliestEnd);
      scheduledDates.set(taskId, {
        startDate: constrained.startDate,
        endDate: constrained.endDate,
      });
    } else {
      // Fallback to original dates
      const constrained = applyConstraint(task, task.startDate, task.endDate);
      scheduledDates.set(taskId, {
        startDate: constrained.startDate,
        endDate: constrained.endDate,
      });
    }
  }

  return { scheduledDates, errors };
}

/**
 * Validate a single dependency constraint.
 * Returns violation if the successor starts/ends too early.
 */
export function validateDependency(
  dependency: DependencyModel,
  predecessorDates: ScheduledDates,
  successorDates: ScheduledDates
): DependencyViolation | null {
  const expected = calculateDependencyDate(
    dependency,
    predecessorDates,
    differenceInDays(successorDates.endDate, successorDates.startDate)
  );

  // Check based on dependency type
  switch (dependency.type) {
    case DependencyType.FinishToStart:
    case DependencyType.StartToStart:
      // Successor starts too early
      if (successorDates.startDate < expected.startDate) {
        return {
          dependencyId: dependency.id,
          type: 'successor_violation',
          predecessorId: dependency.fromTask,
          successorId: dependency.toTask,
          dependencyType: dependency.type,
          expectedDate: expected.startDate,
          actualDate: successorDates.startDate,
          message: `Successor starts before allowed by ${dependency.type} dependency`,
        };
      }
      break;

    case DependencyType.FinishToFinish:
    case DependencyType.StartToEnd:
      // Successor ends too early
      if (successorDates.endDate < expected.endDate) {
        return {
          dependencyId: dependency.id,
          type: 'successor_violation',
          predecessorId: dependency.fromTask,
          successorId: dependency.toTask,
          dependencyType: dependency.type,
          expectedDate: expected.endDate,
          actualDate: successorDates.endDate,
          message: `Successor ends before allowed by ${dependency.type} dependency`,
        };
      }
      break;
  }

  return null;
}

/**
 * Validate all dependencies and return violations.
 */
export function validateAllDependencies(
  tasks: TaskModel[],
  dependencies: DependencyModel[]
): DependencyViolation[] {
  const violations: DependencyViolation[] = [];
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  for (const dep of dependencies) {
    if (!dep.active) continue;

    const pred = taskMap.get(dep.fromTask);
    const succ = taskMap.get(dep.toTask);

    if (!pred?.startDate || !pred?.endDate) continue;
    if (!succ?.startDate || !succ?.endDate) continue;

    const violation = validateDependency(
      dep,
      { startDate: pred.startDate, endDate: pred.endDate },
      { startDate: succ.startDate, endDate: succ.endDate }
    );

    if (violation) {
      violations.push(violation);
    }
  }

  return violations;
}
