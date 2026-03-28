import {
  type DurationUnit,
  ConstraintType,
  type TaskStatus,
  type SchedulingMode,
  CONSTRAINT_TYPES_REQUIRING_DATE
} from './types';

export interface TaskData {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  duration: number;
  durationUnit: DurationUnit;
  percentDone: number;           // 0-100
  parentId: string | null;
  expanded: boolean;
  milestone: boolean;
  manuallyScheduled: boolean;
  constraintType: ConstraintType;
  constraintDate: Date | null;
  schedulingMode: SchedulingMode;
  status: TaskStatus;
  effort: number | null;
  effortUnit: DurationUnit | null;
  cls: string | null;            // CSS class for styling
  notes: string;                 // Task notes/description
}

export class TaskModel implements TaskData {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  duration: number;
  durationUnit: DurationUnit;
  percentDone: number;
  parentId: string | null;
  expanded: boolean;
  milestone: boolean;
  manuallyScheduled: boolean;
  constraintType: ConstraintType;
  constraintDate: Date | null;
  schedulingMode: SchedulingMode;
  status: TaskStatus;
  effort: number | null;
  effortUnit: DurationUnit | null;
  cls: string | null;
  notes: string;

  // Transient - not persisted
  children: TaskModel[] = [];

  constructor(data: TaskData) {
    this.id = data.id;
    this.name = data.name;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    this.duration = data.duration;
    this.durationUnit = data.durationUnit;
    this.percentDone = data.percentDone;
    this.parentId = data.parentId;
    this.expanded = data.expanded;
    this.milestone = data.milestone;
    this.manuallyScheduled = data.manuallyScheduled;
    this.constraintType = data.constraintType;
    this.constraintDate = data.constraintDate;
    this.schedulingMode = data.schedulingMode;
    this.status = data.status;
    this.effort = data.effort;
    this.effortUnit = data.effortUnit;
    this.cls = data.cls;
    this.notes = data.notes;
  }

  get isLeaf(): boolean {
    return this.children.length === 0;
  }

  get isParent(): boolean {
    return this.children.length > 0;
  }

  get isMilestone(): boolean {
    return this.milestone || this.duration === 0;
  }

  validate(): string[] {
    const errors: string[] = [];

    // id must be non-empty string
    if (!this.id || this.id.trim() === '') {
      errors.push('id must be a non-empty string');
    }

    // name must be non-empty string
    if (!this.name || this.name.trim() === '') {
      errors.push('name must be a non-empty string');
    }

    // duration must be >= 0
    if (this.duration < 0) {
      errors.push('duration must be >= 0');
    }

    // percentDone must be 0-100
    if (this.percentDone < 0 || this.percentDone > 100) {
      errors.push('percentDone must be between 0 and 100');
    }

    // If milestone is true, duration must be 0
    if (this.milestone && this.duration !== 0) {
      errors.push('milestone tasks must have duration of 0');
    }

    // If constraintType requires a date, constraintDate must be set
    if (
      CONSTRAINT_TYPES_REQUIRING_DATE.includes(this.constraintType) &&
      this.constraintDate === null
    ) {
      errors.push('constraintDate must be set when constraintType requires a date');
    }

    return errors;
  }

  static create(data: Partial<TaskData>): TaskModel {
    const fullData: TaskData = {
      id: data.id ?? crypto.randomUUID(),
      name: data.name ?? '',
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      duration: data.duration ?? 1,
      durationUnit: data.durationUnit ?? 'day',
      percentDone: data.percentDone ?? 0,
      parentId: data.parentId ?? null,
      expanded: data.expanded ?? true,
      milestone: data.milestone ?? false,
      manuallyScheduled: data.manuallyScheduled ?? false,
      constraintType: data.constraintType ?? ConstraintType.ASAP,
      constraintDate: data.constraintDate ?? null,
      schedulingMode: data.schedulingMode ?? 'Normal',
      status: data.status ?? 'active',
      effort: data.effort ?? null,
      effortUnit: data.effortUnit ?? null,
      cls: data.cls ?? null,
      notes: data.notes ?? ''
    };

    return new TaskModel(fullData);
  }

  static createMilestone(data: Partial<TaskData>): TaskModel {
    return TaskModel.create({
      ...data,
      duration: 0,
      milestone: true
    });
  }
}
