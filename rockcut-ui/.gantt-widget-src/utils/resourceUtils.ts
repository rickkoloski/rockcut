import type { AssignmentModel } from '../models/AssignmentModel';
import type { ResourceModel } from '../models/ResourceModel';
import type { TaskModel } from '../models/TaskModel';
import { addDays } from './dateUtils';

export interface ResourceUtilization {
  resourceId: string;
  date: Date;
  allocatedUnits: number;
  maxUnits: number;
  overallocated: boolean;
  taskIds: string[];  // Tasks contributing to this allocation
}

/**
 * Calculate resource utilization for each day in a date range.
 */
export function calculateUtilization(
  resourceId: string,
  startDate: Date,
  endDate: Date,
  assignments: AssignmentModel[],
  tasks: Map<string, TaskModel>,
  maxUnits: number
): ResourceUtilization[] {
  const result: ResourceUtilization[] = [];
  const resourceAssignments = assignments.filter(a => a.resourceId === resourceId);

  let current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    let allocatedUnits = 0;
    const taskIds: string[] = [];

    for (const assignment of resourceAssignments) {
      const task = tasks.get(assignment.taskId);
      if (!task || !task.startDate || !task.endDate) continue;

      // Check if task spans this date
      const taskStart = new Date(task.startDate);
      const taskEnd = new Date(task.endDate);
      taskStart.setHours(0, 0, 0, 0);
      taskEnd.setHours(0, 0, 0, 0);

      if (current >= taskStart && current <= taskEnd) {
        allocatedUnits += assignment.units;
        taskIds.push(task.id);
      }
    }

    result.push({
      resourceId,
      date: new Date(current),
      allocatedUnits,
      maxUnits,
      overallocated: allocatedUnits > maxUnits,
      taskIds,
    });

    current = addDays(current, 1);
  }

  return result;
}

/**
 * Find dates where resource is overallocated.
 */
export function findOverallocationDates(
  resourceId: string,
  startDate: Date,
  endDate: Date,
  assignments: AssignmentModel[],
  tasks: Map<string, TaskModel>,
  maxUnits: number
): Date[] {
  const utilization = calculateUtilization(
    resourceId,
    startDate,
    endDate,
    assignments,
    tasks,
    maxUnits
  );

  return utilization
    .filter(u => u.overallocated)
    .map(u => u.date);
}

/**
 * Get resource names for a task.
 */
export function getTaskResourceNames(
  taskId: string,
  assignments: AssignmentModel[],
  resources: Map<string, ResourceModel>,
  showUnits: boolean = true
): string[] {
  const taskAssignments = assignments.filter(a => a.taskId === taskId);

  return taskAssignments.map(a => {
    const resource = resources.get(a.resourceId);
    if (!resource) return '';

    if (showUnits && a.units !== 100) {
      return `${resource.name} (${a.units}%)`;
    }
    return resource.name;
  }).filter(Boolean);
}
