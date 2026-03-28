export interface AssignmentData {
  id: string;
  resourceId: string;
  taskId: string;
  units: number;
  effort?: number;
  effortUnit?: 'hour' | 'day';
}

export class AssignmentModel implements AssignmentData {
  id: string;
  resourceId: string;
  taskId: string;
  units: number;
  effort?: number;
  effortUnit?: 'hour' | 'day';

  constructor(data: AssignmentData) {
    this.id = data.id;
    this.resourceId = data.resourceId;
    this.taskId = data.taskId;
    this.units = data.units;
    this.effort = data.effort;
    this.effortUnit = data.effortUnit;
  }

  /**
   * Calculate effort based on task duration and units.
   * Effort = Duration (in days) * hoursPerDay * (units / 100)
   */
  calculateEffort(taskDurationDays: number, hoursPerDay: number = 8): number {
    return taskDurationDays * hoursPerDay * (this.units / 100);
  }

  static create(data: Partial<AssignmentData>): AssignmentModel {
    const fullData: AssignmentData = {
      id: data.id ?? crypto.randomUUID(),
      resourceId: data.resourceId ?? '',
      taskId: data.taskId ?? '',
      units: data.units ?? 100,
      effort: data.effort,
      effortUnit: data.effortUnit,
    };
    return new AssignmentModel(fullData);
  }
}
