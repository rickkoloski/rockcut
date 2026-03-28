import { TaskModel, DependencyModel, DependencyType } from '../models';
import { addDays, differenceInDays } from '../utils/dateUtils';
import { topologicalSort } from './topologicalSort';
import { convertLagToDays } from './dependencyScheduler';

export interface EarlyDates {
  earlyStart: Date;
  earlyFinish: Date;
}

export interface LateDates {
  lateStart: Date;
  lateFinish: Date;
}

export interface SlackInfo {
  totalSlack: number;
  freeSlack: number;
  isCritical: boolean;
}

export interface CPMResult {
  earlyDates: Map<string, EarlyDates>;
  lateDates: Map<string, LateDates>;
  slackInfo: Map<string, SlackInfo>;
  criticalPath: string[];
  projectStart: Date;
  projectEnd: Date;
  projectDuration: number;
}

/**
 * Calculate late finish date based on dependency type (backward pass)
 */
export function calculateBackwardDependencyDate(
  dependency: DependencyModel,
  successorLateDates: LateDates,
  predecessorDuration: number
): Date {
  const lagDays = convertLagToDays(dependency.lag, dependency.lagUnit);

  switch (dependency.type) {
    case DependencyType.FinishToStart:
      // Predecessor must finish before successor late start - lag
      return addDays(successorLateDates.lateStart, -lagDays);

    case DependencyType.StartToStart:
      // Predecessor must start before successor late start - lag
      // So pred LS = succ LS - lag, and pred LF = pred LS + duration
      const ssLS = addDays(successorLateDates.lateStart, -lagDays);
      return addDays(ssLS, predecessorDuration);

    case DependencyType.FinishToFinish:
      // Predecessor must finish before successor late finish - lag
      return addDays(successorLateDates.lateFinish, -lagDays);

    case DependencyType.StartToEnd:
      // Predecessor must start before successor late finish - lag
      // So pred LS = succ LF - lag - pred duration
      const sfLS = addDays(successorLateDates.lateFinish, -lagDays);
      return addDays(sfLS, predecessorDuration);

    default:
      return addDays(successorLateDates.lateStart, -lagDays);
  }
}

/**
 * Run backward pass to calculate late start/finish dates.
 * Must be run after forward pass.
 */
export function backwardPass(
  tasks: TaskModel[],
  dependencies: DependencyModel[],
  earlyDates: Map<string, EarlyDates>,
  projectEndDate: Date,
  taskLookup: Map<string, TaskModel>
): Map<string, LateDates> {
  const lateDates = new Map<string, LateDates>();

  // Get leaf tasks only
  const leafTasks = tasks.filter(t => t.isLeaf);

  // Get reverse topological order (process successors before predecessors)
  let sortedIds: string[];
  try {
    sortedIds = topologicalSort(leafTasks, dependencies).reverse();
  } catch {
    // If cycle detected, return empty map
    return lateDates;
  }

  for (const taskId of sortedIds) {
    const task = taskLookup.get(taskId);
    if (!task || !task.startDate || !task.endDate) continue;

    // Get all outgoing dependencies (where this task is predecessor)
    const successorDeps = dependencies.filter(
      d => d.fromTask === taskId && d.active
    );

    if (successorDeps.length === 0) {
      // No successors - late finish is project end
      const lf = projectEndDate;
      const ls = addDays(lf, -task.duration);
      lateDates.set(taskId, { lateStart: ls, lateFinish: lf });
      continue;
    }

    // Calculate latest finish based on all successors
    // Take the MINIMUM (most constraining) late finish
    let latestFinish: Date | null = null;

    for (const dep of successorDeps) {
      const succLateDates = lateDates.get(dep.toTask);
      if (!succLateDates) continue;

      const constrainedLF = calculateBackwardDependencyDate(
        dep,
        succLateDates,
        task.duration
      );

      if (latestFinish === null || constrainedLF < latestFinish) {
        latestFinish = constrainedLF;
      }
    }

    if (latestFinish) {
      lateDates.set(taskId, {
        lateStart: addDays(latestFinish, -task.duration),
        lateFinish: latestFinish,
      });
    } else {
      // Fallback to project end
      lateDates.set(taskId, {
        lateStart: addDays(projectEndDate, -task.duration),
        lateFinish: projectEndDate,
      });
    }
  }

  return lateDates;
}

/**
 * Calculate total and free slack for a task.
 */
export function calculateSlack(
  task: TaskModel,
  earlyDates: EarlyDates,
  lateDates: LateDates,
  allEarlyDates: Map<string, EarlyDates>,
  dependencies: DependencyModel[]
): SlackInfo {
  // Total Slack = Late Start - Early Start
  const totalSlack = differenceInDays(lateDates.lateStart, earlyDates.earlyStart);

  // Free Slack = minimum delay without affecting any successor's early start
  const successorDeps = dependencies.filter(d => d.fromTask === task.id && d.active);

  let freeSlack = totalSlack; // Default to total slack if no successors

  if (successorDeps.length > 0) {
    let minAllowedDelay = Infinity;

    for (const dep of successorDeps) {
      const succEarly = allEarlyDates.get(dep.toTask);
      if (!succEarly) continue;

      const lagDays = convertLagToDays(dep.lag, dep.lagUnit);
      let allowedDelay: number;

      switch (dep.type) {
        case DependencyType.FinishToStart:
          // How much can our EF slip before it affects successor ES?
          // Constraint: EF + lag <= successor ES
          // Allowed delay = successor ES - EF - lag
          allowedDelay = differenceInDays(succEarly.earlyStart, earlyDates.earlyFinish) - lagDays;
          break;

        case DependencyType.StartToStart:
          // Constraint: ES + lag <= successor ES
          allowedDelay = differenceInDays(succEarly.earlyStart, earlyDates.earlyStart) - lagDays;
          break;

        case DependencyType.FinishToFinish:
          // Constraint: EF + lag <= successor EF
          allowedDelay = differenceInDays(succEarly.earlyFinish, earlyDates.earlyFinish) - lagDays;
          break;

        case DependencyType.StartToEnd:
          // Constraint: ES + lag <= successor EF
          allowedDelay = differenceInDays(succEarly.earlyFinish, earlyDates.earlyStart) - lagDays;
          break;

        default:
          allowedDelay = differenceInDays(succEarly.earlyStart, earlyDates.earlyFinish) - lagDays;
      }

      if (allowedDelay < minAllowedDelay) {
        minAllowedDelay = allowedDelay;
      }
    }

    freeSlack = Math.max(0, minAllowedDelay);
  }

  return {
    totalSlack: Math.max(0, totalSlack),
    freeSlack: Math.max(0, freeSlack),
    isCritical: totalSlack <= 0,
  };
}

/**
 * Find all critical tasks (tasks with zero total slack).
 */
export function findCriticalPath(
  tasks: TaskModel[],
  slackMap: Map<string, SlackInfo>
): string[] {
  return tasks
    .filter(t => t.isLeaf)
    .filter(t => {
      const slack = slackMap.get(t.id);
      return slack && slack.isCritical;
    })
    .map(t => t.id);
}

/**
 * Get project end date (maximum early finish of all tasks).
 */
export function getProjectEndDate(
  tasks: TaskModel[],
  earlyDates: Map<string, EarlyDates>
): Date {
  let maxDate: Date | null = null;

  for (const task of tasks) {
    if (!task.isLeaf) continue;

    const early = earlyDates.get(task.id);
    if (early && (maxDate === null || early.earlyFinish > maxDate)) {
      maxDate = early.earlyFinish;
    }
  }

  // Fallback to today if no dates
  return maxDate ?? new Date();
}

/**
 * Get project start date (minimum early start of all tasks).
 */
export function getProjectStartDate(
  tasks: TaskModel[],
  earlyDates: Map<string, EarlyDates>
): Date {
  let minDate: Date | null = null;

  for (const task of tasks) {
    if (!task.isLeaf) continue;

    const early = earlyDates.get(task.id);
    if (early && (minDate === null || early.earlyStart < minDate)) {
      minDate = early.earlyStart;
    }
  }

  return minDate ?? new Date();
}

/**
 * Run complete CPM analysis.
 */
export function analyzeCPM(
  tasks: TaskModel[],
  dependencies: DependencyModel[],
  taskLookup: Map<string, TaskModel>
): CPMResult {
  const leafTasks = tasks.filter(t => t.isLeaf);

  // Build early dates from task data (already calculated by forward pass in D10)
  const earlyDates = new Map<string, EarlyDates>();
  for (const task of leafTasks) {
    if (task.startDate && task.endDate) {
      earlyDates.set(task.id, {
        earlyStart: task.startDate,
        earlyFinish: task.endDate,
      });
    }
  }

  // Get project dates
  const projectStart = getProjectStartDate(leafTasks, earlyDates);
  const projectEnd = getProjectEndDate(leafTasks, earlyDates);
  const projectDuration = differenceInDays(projectEnd, projectStart);

  // Run backward pass
  const lateDates = backwardPass(
    leafTasks,
    dependencies,
    earlyDates,
    projectEnd,
    taskLookup
  );

  // Calculate slack for each task
  const slackInfo = new Map<string, SlackInfo>();
  for (const task of leafTasks) {
    const early = earlyDates.get(task.id);
    const late = lateDates.get(task.id);

    if (early && late) {
      const slack = calculateSlack(task, early, late, earlyDates, dependencies);
      slackInfo.set(task.id, slack);
    }
  }

  // Find critical path
  const criticalPath = findCriticalPath(leafTasks, slackInfo);

  return {
    earlyDates,
    lateDates,
    slackInfo,
    criticalPath,
    projectStart,
    projectEnd,
    projectDuration,
  };
}
