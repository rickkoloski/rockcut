// Duration units
export type DurationUnit = 'hour' | 'day' | 'week' | 'month';

// Dependency types (standard project management)
export enum DependencyType {
  StartToStart = 0,   // SS: Successor can't start before predecessor starts
  StartToEnd = 1,     // SE: Successor can't end before predecessor starts
  FinishToStart = 2,  // FS: Successor can't start before predecessor finishes (default)
  FinishToFinish = 3  // FF: Successor can't end before predecessor finishes
}

// Constraint types (MS Project compatible)
export enum ConstraintType {
  ASAP = 'ASAP',  // As Soon As Possible (default)
  ALAP = 'ALAP',  // As Late As Possible
  SNET = 'SNET',  // Start No Earlier Than
  SNLT = 'SNLT',  // Start No Later Than
  FNET = 'FNET',  // Finish No Earlier Than
  FNLT = 'FNLT',  // Finish No Later Than
  MSO = 'MSO',    // Must Start On
  MFO = 'MFO'     // Must Finish On
}

// Task status (for progress tracking)
export enum TaskStatus {
  NotStarted = 'not-started',
  InProgress = 'in-progress',
  Complete = 'complete',
  Overdue = 'overdue',
}

// Scheduling mode
export type SchedulingMode = 'Normal' | 'FixedDuration' | 'FixedEffort' | 'FixedUnits';

// Constraint types that require a date
export const CONSTRAINT_TYPES_REQUIRING_DATE: ConstraintType[] = [
  ConstraintType.SNET,
  ConstraintType.SNLT,
  ConstraintType.FNET,
  ConstraintType.FNLT,
  ConstraintType.MSO,
  ConstraintType.MFO
];
