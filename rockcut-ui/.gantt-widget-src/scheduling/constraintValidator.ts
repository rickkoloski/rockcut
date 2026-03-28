import { TaskModel } from '../models/TaskModel';
import { ConstraintType } from '../models/types';
import { differenceInDays, addDays, isSameDay, formatDateFull } from '../utils/dateUtils';

export interface ConstraintValidationResult {
  isValid: boolean;
  violation: ConstraintViolation | null;
}

export interface ConstraintViolation {
  taskId: string;
  constraintType: ConstraintType;
  constraintDate: Date;
  actualDate: Date;
  violationType: 'early' | 'late' | 'wrong_date';
  message: string;
}

export interface ApplyConstraintOptions {
  respectConstraint?: boolean;
  allowViolation?: boolean;
}

export interface AppliedConstraintResult {
  startDate: Date;
  endDate: Date;
  constrained: boolean;
}

/**
 * Validate a task's constraint
 */
export function validateConstraint(task: TaskModel): ConstraintValidationResult {
  const { constraintType, constraintDate, startDate, endDate } = task;

  // ASAP and ALAP have no constraint date to validate against
  if (constraintType === ConstraintType.ASAP || constraintType === ConstraintType.ALAP) {
    return { isValid: true, violation: null };
  }

  // Other constraints require a constraint date
  if (!constraintDate) {
    return { isValid: true, violation: null };
  }

  // Task must have dates to validate
  if (!startDate || !endDate) {
    return { isValid: true, violation: null };
  }

  switch (constraintType) {
    case ConstraintType.SNET:
      if (startDate < constraintDate) {
        return {
          isValid: false,
          violation: {
            taskId: task.id,
            constraintType,
            constraintDate,
            actualDate: startDate,
            violationType: 'early',
            message: `Task starts before ${formatDateFull(constraintDate)} (SNET)`
          }
        };
      }
      break;

    case ConstraintType.SNLT:
      if (startDate > constraintDate) {
        return {
          isValid: false,
          violation: {
            taskId: task.id,
            constraintType,
            constraintDate,
            actualDate: startDate,
            violationType: 'late',
            message: `Task starts after ${formatDateFull(constraintDate)} (SNLT)`
          }
        };
      }
      break;

    case ConstraintType.FNET:
      if (endDate < constraintDate) {
        return {
          isValid: false,
          violation: {
            taskId: task.id,
            constraintType,
            constraintDate,
            actualDate: endDate,
            violationType: 'early',
            message: `Task finishes before ${formatDateFull(constraintDate)} (FNET)`
          }
        };
      }
      break;

    case ConstraintType.FNLT:
      if (endDate > constraintDate) {
        return {
          isValid: false,
          violation: {
            taskId: task.id,
            constraintType,
            constraintDate,
            actualDate: endDate,
            violationType: 'late',
            message: `Task finishes after ${formatDateFull(constraintDate)} (FNLT)`
          }
        };
      }
      break;

    case ConstraintType.MSO:
      if (!isSameDay(startDate, constraintDate)) {
        return {
          isValid: false,
          violation: {
            taskId: task.id,
            constraintType,
            constraintDate,
            actualDate: startDate,
            violationType: 'wrong_date',
            message: `Task must start on ${formatDateFull(constraintDate)} (MSO)`
          }
        };
      }
      break;

    case ConstraintType.MFO:
      if (!isSameDay(endDate, constraintDate)) {
        return {
          isValid: false,
          violation: {
            taskId: task.id,
            constraintType,
            constraintDate,
            actualDate: endDate,
            violationType: 'wrong_date',
            message: `Task must finish on ${formatDateFull(constraintDate)} (MFO)`
          }
        };
      }
      break;
  }

  return { isValid: true, violation: null };
}

/**
 * Validate all constraints and return violations
 */
export function validateAllConstraints(tasks: TaskModel[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const task of tasks) {
    const result = validateConstraint(task);
    if (!result.isValid && result.violation) {
      violations.push(result.violation);
    }
  }

  return violations;
}

/**
 * Apply constraint to proposed dates
 * Returns adjusted dates that respect the constraint
 */
export function applyConstraint(
  task: TaskModel,
  proposedStart: Date,
  proposedEnd: Date,
  options: ApplyConstraintOptions = {}
): AppliedConstraintResult {
  const { constraintType, constraintDate } = task;
  const { respectConstraint = true } = options;

  if (!respectConstraint || !constraintDate) {
    return { startDate: proposedStart, endDate: proposedEnd, constrained: false };
  }

  // ASAP and ALAP don't restrict dates (they're scheduling preferences)
  if (constraintType === ConstraintType.ASAP || constraintType === ConstraintType.ALAP) {
    return { startDate: proposedStart, endDate: proposedEnd, constrained: false };
  }

  const duration = differenceInDays(proposedEnd, proposedStart);

  switch (constraintType) {
    case ConstraintType.SNET:
      if (proposedStart < constraintDate) {
        const adjustedStart = constraintDate;
        const adjustedEnd = addDays(adjustedStart, duration);
        return { startDate: adjustedStart, endDate: adjustedEnd, constrained: true };
      }
      break;

    case ConstraintType.SNLT:
      if (proposedStart > constraintDate) {
        const adjustedStart = constraintDate;
        const adjustedEnd = addDays(adjustedStart, duration);
        return { startDate: adjustedStart, endDate: adjustedEnd, constrained: true };
      }
      break;

    case ConstraintType.FNET:
      if (proposedEnd < constraintDate) {
        const adjustedEnd = constraintDate;
        const adjustedStart = addDays(adjustedEnd, -duration);
        return { startDate: adjustedStart, endDate: adjustedEnd, constrained: true };
      }
      break;

    case ConstraintType.FNLT:
      if (proposedEnd > constraintDate) {
        const adjustedEnd = constraintDate;
        const adjustedStart = addDays(adjustedEnd, -duration);
        return { startDate: adjustedStart, endDate: adjustedEnd, constrained: true };
      }
      break;

    case ConstraintType.MSO:
      return {
        startDate: constraintDate,
        endDate: addDays(constraintDate, duration),
        constrained: true
      };

    case ConstraintType.MFO:
      return {
        startDate: addDays(constraintDate, -duration),
        endDate: constraintDate,
        constrained: true
      };
  }

  return { startDate: proposedStart, endDate: proposedEnd, constrained: false };
}

/**
 * Get constraint description
 */
export function getConstraintDescription(constraintType: ConstraintType): string {
  switch (constraintType) {
    case ConstraintType.ASAP:
      return 'As Soon As Possible';
    case ConstraintType.ALAP:
      return 'As Late As Possible';
    case ConstraintType.SNET:
      return 'Start No Earlier Than';
    case ConstraintType.SNLT:
      return 'Start No Later Than';
    case ConstraintType.FNET:
      return 'Finish No Earlier Than';
    case ConstraintType.FNLT:
      return 'Finish No Later Than';
    case ConstraintType.MSO:
      return 'Must Start On';
    case ConstraintType.MFO:
      return 'Must Finish On';
    default:
      return 'Unknown';
  }
}

/**
 * Check if constraint type requires a date
 */
export function constraintRequiresDate(constraintType: ConstraintType): boolean {
  return constraintType !== ConstraintType.ASAP && constraintType !== ConstraintType.ALAP;
}

/**
 * Check if constraint is a fixed constraint (MSO/MFO)
 */
export function isFixedConstraint(constraintType: ConstraintType): boolean {
  return constraintType === ConstraintType.MSO || constraintType === ConstraintType.MFO;
}
