import type { TaskData } from '../../models/TaskModel';

export interface ValidationErrors {
  [key: string]: string;
}

export function validateTaskDraft(draft: Partial<TaskData>): ValidationErrors {
  const errors: ValidationErrors = {};

  // Name is required
  if (!draft.name?.trim()) {
    errors.name = 'Name is required';
  }

  // Start date is required
  if (!draft.startDate) {
    errors.startDate = 'Start date is required';
  }

  // End date is required
  if (!draft.endDate) {
    errors.endDate = 'End date is required';
  }

  // End date must be >= start date
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    errors.endDate = 'End date must be on or after start date';
  }

  // Duration must be positive (unless milestone)
  if (draft.duration !== undefined && draft.duration < 0) {
    errors.duration = 'Duration must be 0 or greater';
  }

  // Milestone should have 0 duration
  if (draft.milestone && draft.duration !== 0) {
    errors.duration = 'Milestone tasks must have 0 duration';
  }

  // Progress must be 0-100
  if (draft.percentDone !== undefined) {
    if (draft.percentDone < 0 || draft.percentDone > 100) {
      errors.percentDone = 'Progress must be between 0 and 100';
    }
  }

  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}
