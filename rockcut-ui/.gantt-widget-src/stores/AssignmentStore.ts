import { Store } from './Store';
import { AssignmentModel } from '../models/AssignmentModel';

export class AssignmentStore extends Store<AssignmentModel> {
  constructor() {
    super();
  }

  /**
   * Get all assignments for a task.
   */
  getByTaskId(taskId: string): AssignmentModel[] {
    return this.getAll().filter(a => a.taskId === taskId);
  }

  /**
   * Get all assignments for a resource.
   */
  getByResourceId(resourceId: string): AssignmentModel[] {
    return this.getAll().filter(a => a.resourceId === resourceId);
  }

  /**
   * Find assignment by task and resource combination.
   */
  findAssignment(taskId: string, resourceId: string): AssignmentModel | undefined {
    return this.getAll().find(
      a => a.taskId === taskId && a.resourceId === resourceId
    );
  }

  /**
   * Assign resource to task. Creates new assignment if not exists.
   */
  assign(taskId: string, resourceId: string, units: number = 100): AssignmentModel {
    // Check if already assigned
    const existing = this.findAssignment(taskId, resourceId);
    if (existing) {
      // Update units if different
      if (existing.units !== units) {
        this.update(existing.id, { units });
      }
      return existing;
    }

    // Create new assignment
    const assignment = AssignmentModel.create({
      taskId,
      resourceId,
      units,
    });
    this.add(assignment);
    return assignment;
  }

  /**
   * Unassign resource from task.
   */
  unassign(taskId: string, resourceId: string): void {
    const assignment = this.findAssignment(taskId, resourceId);
    if (assignment) {
      this.remove(assignment.id);
    }
  }

  /**
   * Update assignment units.
   */
  updateUnits(assignmentId: string, units: number): void {
    this.update(assignmentId, { units });
  }

  /**
   * Get total units assigned to a resource across all tasks.
   * Note: This is a simple sum, doesn't account for time overlaps.
   */
  getTotalUnits(resourceId: string): number {
    return this.getByResourceId(resourceId)
      .reduce((sum, a) => sum + a.units, 0);
  }

  /**
   * Check if resource is overallocated (simple check).
   * For proper overallocation detection, use resourceUtils.
   */
  isOverallocated(resourceId: string, maxUnits: number): boolean {
    return this.getTotalUnits(resourceId) > maxUnits;
  }
}
